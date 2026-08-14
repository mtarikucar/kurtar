import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Merchant, MerchantVerificationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import { isValidTaxId } from "../../common/utils/tax-id.util";
import { isValidIban } from "../../common/utils/iban.util";
import { TokenService, IssuedTokens } from "../auth/services/token.service";
import { OffersService } from "../offers/offers.service";
import { MerchantSignupDto } from "./dto/merchant-signup.dto";
import { MerchantSubmitDto } from "./dto/merchant-submit.dto";
import { allowedFromStatusesFor } from "./merchant-verification-transitions";
import { OutboxService } from "../outbox/outbox.service";
import { OUTBOX_EVENT_TYPES, OutboxEventType } from "../outbox/event-types";

const MERCHANT_STATUS_EVENT_TYPE: Partial<
  Record<MerchantVerificationStatus, OutboxEventType>
> = {
  APPROVED: OUTBOX_EVENT_TYPES.MERCHANT_APPROVED_V1,
  REJECTED: OUTBOX_EVENT_TYPES.MERCHANT_REJECTED_V1,
  SUSPENDED: OUTBOX_EVENT_TYPES.MERCHANT_SUSPENDED_V1,
};

const BCRYPT_COST = 12;

export interface MerchantSignupResult extends IssuedTokens {
  merchant: { id: string; verificationStatus: MerchantVerificationStatus };
}

export interface MerchantSuspendResult {
  merchantId: string;
  status: "SUSPENDED";
  offersCancelled: number;
}

function merchantNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "MERCHANT_NOT_FOUND",
    message: "Merchant not found.",
  });
}

function invalidTaxIdError() {
  return new BadRequestException({
    statusCode: 400,
    errorCode: "MERCHANT_SIGNUP_INVALID_TAX_ID",
    message: "taxId must be a valid 10-digit VKN or 11-digit TCKN.",
  });
}

function invalidIbanError() {
  return new BadRequestException({
    statusCode: 400,
    errorCode: "MERCHANT_SIGNUP_INVALID_IBAN",
    message: "iban must be a valid Turkish IBAN (TR + 24 characters).",
  });
}

function emailTakenError() {
  return new ConflictException({
    statusCode: 409,
    errorCode: "MERCHANT_EMAIL_TAKEN",
    message: "An account with this email already exists.",
  });
}

function attestationRequiredError() {
  return new BadRequestException({
    statusCode: 400,
    errorCode: "MERCHANT_ATTESTATION_REQUIRED",
    message:
      "sttAttestationAccepted and intermediationAccepted must both be true to submit.",
  });
}

/**
 * Merchant onboarding (KYC) — signup, self-submit, and the admin
 * approve/reject/suspend surface. Every verificationStatus change is a
 * compound-WHERE guarded update deriving its "from" list from
 * merchant-verification-transitions.ts's allowedFromStatusesFor — the
 * transitions map IS the enforcement (Task 4's I4 finding), never a
 * separate hand-typed check. Every transition also writes a
 * MerchantVerificationEvent row in the SAME transaction as the status
 * change, so the audit trail can never disagree with what actually
 * committed.
 */
@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly offersService: OffersService,
    private readonly outbox: OutboxService,
  ) {}

  async signup(dto: MerchantSignupDto): Promise<MerchantSignupResult> {
    if (!isValidTaxId(dto.taxId)) throw invalidTaxIdError();
    if (!isValidIban(dto.iban)) throw invalidIbanError();

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    let created: { merchant: Merchant; merchantUserId: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const merchant = await tx.merchant.create({
          data: {
            legalName: dto.legalName,
            tradeName: dto.tradeName,
            taxId: dto.taxId,
            iban: dto.iban,
          },
        });
        const merchantUser = await tx.merchantUser.create({
          data: {
            merchantId: merchant.id,
            email: dto.email,
            name: dto.ownerName,
            passwordHash,
            role: "OWNER",
          },
        });
        return { merchant, merchantUserId: merchantUser.id };
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err, "email")) {
        throw emailTakenError();
      }
      throw err;
    }

    const tokens = await this.tokenService.issueTokens({
      id: created.merchantUserId,
      actor: "MERCHANT",
      merchantId: created.merchant.id,
      role: "OWNER",
    });

    return {
      ...tokens,
      merchant: {
        id: created.merchant.id,
        verificationStatus: created.merchant.verificationStatus,
      },
    };
  }

  async submit(
    merchantId: string,
    dto: MerchantSubmitDto,
  ): Promise<{ merchantId: string; status: "SUBMITTED" }> {
    if (!dto.sttAttestationAccepted || !dto.intermediationAccepted) {
      throw attestationRequiredError();
    }

    const fromStatuses = allowedFromStatusesFor("SUBMITTED");
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.merchant.findUnique({
        where: { id: merchantId },
        select: { verificationStatus: true },
      });
      if (!current) throw merchantNotFoundError();

      const updated = await tx.merchant.updateMany({
        where: { id: merchantId, verificationStatus: { in: fromStatuses } },
        data: {
          verificationStatus: "SUBMITTED",
          sttAttestationAcceptedAt: now,
          intermediationAcceptedAt: now,
          intermediationContractVersion: dto.intermediationContractVersion,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          statusCode: 409,
          errorCode: "MERCHANT_NOT_SUBMITTABLE",
          message: `Merchant is in ${current.verificationStatus}, which cannot be submitted for review.`,
        });
      }

      await tx.merchantVerificationEvent.create({
        data: {
          merchantId,
          fromStatus: current.verificationStatus,
          toStatus: "SUBMITTED",
          // dto.docsJson is validated as a plain object by @IsObject(); the
          // cast is only needed because Prisma's generated InputJsonValue
          // type doesn't structurally match a generic Record<string,
          // unknown> even though every value class-validator accepts here
          // is JSON-serializable.
          docsJson: dto.docsJson as Prisma.InputJsonValue | undefined,
        },
      });
    });

    return { merchantId, status: "SUBMITTED" };
  }

  async getMe(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        stores: {
          select: {
            id: true,
            name: true,
            city: true,
            district: true,
            active: true,
          },
        },
      },
    });
    if (!merchant) throw merchantNotFoundError();

    return {
      id: merchant.id,
      legalName: merchant.legalName,
      tradeName: merchant.tradeName,
      taxId: merchant.taxId,
      iban: merchant.iban,
      verificationStatus: merchant.verificationStatus,
      verifiedAt: merchant.verifiedAt,
      nextReverifyAt: merchant.nextReverifyAt,
      sttAttestationAcceptedAt: merchant.sttAttestationAcceptedAt,
      intermediationAcceptedAt: merchant.intermediationAcceptedAt,
      intermediationContractVersion: merchant.intermediationContractVersion,
      createdAt: merchant.createdAt,
      stores: merchant.stores,
    };
  }

  async adminList(
    status: MerchantVerificationStatus | undefined,
    page: number,
    pageSize: number,
  ) {
    const where = status ? { verificationStatus: status } : {};
    const [items, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          taxId: true,
          verificationStatus: true,
          verifiedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.merchant.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async adminApprove(
    adminId: string,
    merchantId: string,
    note: string | undefined,
  ) {
    return this.transition(merchantId, "APPROVED", adminId, note, {
      verifiedAt: new Date(),
      nextReverifyAt: addYears(new Date(), 1),
    });
  }

  async adminReject(
    adminId: string,
    merchantId: string,
    note: string | undefined,
  ) {
    return this.transition(merchantId, "REJECTED", adminId, note);
  }

  /**
   * Kill-switch: suspend an APPROVED merchant, then cancel every active
   * offer across all of their stores through OffersService — "via the
   * offers service" per the brief, which in turn calls
   * ReservationsService.cancelAllForOffer for the reservation-level fan
   * out. Merchant status transition is its own small transaction (fast,
   * one row + one audit event); the potentially-large multi-offer,
   * multi-refund cancellation runs AFTER it commits, exactly like
   * OffersService.cancel() runs its own refund I/O after its transaction
   * commits — provider calls never happen inside a $transaction.
   */
  async adminSuspend(
    adminId: string,
    merchantId: string,
    note: string | undefined,
  ): Promise<MerchantSuspendResult> {
    await this.transition(merchantId, "SUSPENDED", adminId, note);

    const cancelled = await this.offersService.cancelAllActiveForMerchant(
      merchantId,
      "ADMIN",
    );
    if (cancelled.failures.length > 0) {
      this.logger.warn(
        `Suspend kill-switch for merchant ${merchantId}: ${cancelled.failures.length} offer(s) failed to cancel cleanly: ${JSON.stringify(cancelled.failures)}`,
      );
    }

    return {
      merchantId,
      status: "SUSPENDED",
      offersCancelled: cancelled.offersCancelled,
    };
  }

  private async transition(
    merchantId: string,
    to: MerchantVerificationStatus,
    adminId: string,
    note: string | undefined,
    extraData: Record<string, unknown> = {},
  ): Promise<{ merchantId: string; status: MerchantVerificationStatus }> {
    const fromStatuses = allowedFromStatusesFor(to);

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.merchant.findUnique({
        where: { id: merchantId },
        select: { verificationStatus: true },
      });
      if (!current) throw merchantNotFoundError();

      const updated = await tx.merchant.updateMany({
        where: { id: merchantId, verificationStatus: { in: fromStatuses } },
        data: { verificationStatus: to, ...extraData },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          statusCode: 409,
          errorCode: `MERCHANT_NOT_${transitionVerb(to)}`,
          message: `Merchant is in ${current.verificationStatus}, which cannot transition to ${to}.`,
        });
      }

      const verificationEvent = await tx.merchantVerificationEvent.create({
        data: {
          merchantId,
          fromStatus: current.verificationStatus,
          toStatus: to,
          actorAdminId: adminId,
          note,
        },
      });

      // [Task 7] Only APPROVED/REJECTED/SUSPENDED get a merchant email —
      // transition()'s only 3 callers (adminApprove/adminReject/
      // adminSuspend) never pass any other `to`, so this map covers every
      // real call site; MERCHANT_STATUS_EVENT_TYPE simply has no entry for
      // anything else. idempotencyKey is keyed off the
      // MerchantVerificationEvent row just created (not off merchantId+to)
      // — this status is reachable at most once per merchant today
      // (merchant-verification-transitions.ts has no re-entry edge back
      // into APPROVED/REJECTED/SUSPENDED), but keying off a fresh id per
      // transition rather than a static string means this stays correct
      // even if a future task adds a reinstate/resubmit flow.
      const eventType = MERCHANT_STATUS_EVENT_TYPE[to];
      if (eventType) {
        await this.outbox.publish(tx, {
          type: eventType,
          payload: { merchantId, note },
          idempotencyKey: `merchant-status:${verificationEvent.id}`,
        });
      }
    });

    return { merchantId, status: to };
  }
}

function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function transitionVerb(to: MerchantVerificationStatus): string {
  const verbs: Record<MerchantVerificationStatus, string> = {
    DRAFT: "DRAFT",
    SUBMITTED: "SUBMITTABLE",
    UNDER_REVIEW: "REVIEWABLE",
    APPROVED: "APPROVABLE",
    REJECTED: "REJECTABLE",
    SUSPENDED: "SUSPENDABLE",
  };
  return verbs[to];
}
