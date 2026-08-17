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

export interface AdminMerchantVerificationEvent {
  id: string;
  fromStatus: MerchantVerificationStatus;
  toStatus: MerchantVerificationStatus;
  actorAdminId: string | null;
  note: string | null;
  docsJson: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface AdminMerchantDetail {
  id: string;
  legalName: string;
  tradeName: string;
  taxId: string;
  mersisNo: string | null;
  kepAddress: string | null;
  iban: string;
  verificationStatus: MerchantVerificationStatus;
  verifiedAt: Date | null;
  nextReverifyAt: Date | null;
  sttAttestationAcceptedAt: Date | null;
  intermediationAcceptedAt: Date | null;
  intermediationContractVersion: string | null;
  docsJson: Prisma.JsonValue | null;
  verificationEvents: AdminMerchantVerificationEvent[];
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

  /**
   * [Admin KYC detail] GET /admin/merchants/:id — the ONLY place an admin
   * sees what a merchant actually submitted before approving/rejecting
   * them. `adminList` above is deliberately a thin queue (id/legalName/
   * tradeName/taxId/verificationStatus/verifiedAt/createdAt) — none of
   * taxId's cross-check material, iban, mersisNo, kepAddress, docsJson,
   * or the attestation timestamps are selected there. Without a detail
   * read exposing those, the approval step (the platform's SOLE identity
   * control at launch — nothing else binds taxId to legalName or stops
   * two merchants sharing an IBAN) is a rubber stamp: a human asked to
   * approve or reject with nothing to actually judge.
   *
   * Reading this row is itself a sensitive action (bank details, KYC
   * documents), so the read and its own AuditLog row commit together in
   * ONE transaction — if the audit write fails, the read fails too,
   * rather than silently handing back sensitive data with no trail. Same
   * {actorType,actorId,action,entity,entityId,diffJson} shape and the
   * same entity.verb action-naming convention every other admin mutation
   * in this codebase already uses (stores.service.ts's adminDeactivate,
   * ratings.service.ts's moderate, etc.) — this is the one case where the
   * audited action is a READ, not a write, so diffJson records the
   * merchant's verificationStatus AT THE TIME OF VIEWING (there is no
   * before/after diff for a read, but "what state was true when this
   * admin looked" is still real, useful audit context).
   *
   * [Masking decision] iban is returned IN FULL, not masked to last-4.
   * The whole reason this endpoint exists is so an approver can
   * cross-check the IBAN against the bank document in docsJson — a
   * masked value would be useless for that, defeating the endpoint's own
   * purpose. This is the tradeoff the brief asked to make deliberately:
   * full IBAN is exposed ONLY here, ONLY to ADMIN, ONLY with an audit
   * trail — confirmed NOT to appear on adminList above (thin queue,
   * no iban selected) and confirmed the only OTHER places `merchant.iban`
   * is ever selected are (a) the merchant's own GET /merchants/me (a
   * merchant seeing their own registered bank details back is not a
   * leak), (b) admin/exports' merchants.csv and settlements.service.ts's
   * adminGet — both already ADMIN-scoped surfaces, not new exposure.
   *
   * `docsJson` is stored per-VerificationEvent (each submission/
   * resubmission can carry its own document snapshot), not on Merchant
   * itself — the top-level `docsJson` field here is a convenience: the
   * most recent non-null one, i.e. the documents behind whatever
   * submission the merchant's CURRENT status reflects. The full
   * `verificationEvents` history (including every past docsJson, not
   * just the latest) is also returned in full — nothing is hidden behind
   * the convenience field.
   */
  async adminGetDetail(
    adminId: string,
    merchantId: string,
  ): Promise<AdminMerchantDetail> {
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUnique({
        where: { id: merchantId },
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          taxId: true,
          mersisNo: true,
          kepAddress: true,
          iban: true,
          verificationStatus: true,
          verifiedAt: true,
          nextReverifyAt: true,
          sttAttestationAcceptedAt: true,
          intermediationAcceptedAt: true,
          intermediationContractVersion: true,
          verificationEvents: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              actorAdminId: true,
              note: true,
              docsJson: true,
              createdAt: true,
            },
          },
        },
      });
      if (!merchant) throw merchantNotFoundError();

      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          action: "merchant.kyc.viewed",
          entity: "Merchant",
          entityId: merchantId,
          diffJson: { verificationStatus: merchant.verificationStatus },
        },
      });

      const latestDocsJson =
        [...merchant.verificationEvents]
          .reverse()
          .find((e) => e.docsJson !== null)?.docsJson ?? null;

      return { ...merchant, docsJson: latestDocsJson };
    });
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

      // [Task 8] A second, independent event for the SAME APPROVED
      // transition — see OUTBOX_EVENT_TYPES.MERCHANT_APPROVED_MEMBERSHIP_V1's
      // doc comment for why this can't just reuse merchant.approved.v1
      // above (one handler per type). Drives MembershipApprovedHandler
      // creating the merchant's MembershipSubscription.
      if (to === "APPROVED") {
        await this.outbox.publish(tx, {
          type: OUTBOX_EVENT_TYPES.MERCHANT_APPROVED_MEMBERSHIP_V1,
          payload: { merchantId },
          idempotencyKey: `merchant-approved-membership:${verificationEvent.id}`,
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
