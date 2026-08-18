import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SettlementStatus } from "@prisma/client";
import { istanbulDateKey } from "../../common/utils/istanbul-date.util";
import { PrismaService } from "../../prisma/prisma.service";
import { SettlementBatchBuilderService } from "./settlement-batch-builder.service";
import { SettlementPayoutService } from "./settlement-payout.service";
import { allowedFromStatusesFor } from "./settlement-transitions";

// [Fix round, I13] Derived from the transitions map, not hand-typed —
// approve()/hold() previously each wrote their own `{in: [...]}` guard,
// and those guards silently disagreed with each other and with
// settlement-payout.service.ts's markSent (that disagreement is how C2/C3
// were reachable at all).
const APPROVED_FROM_STATUSES = allowedFromStatusesFor("APPROVED");
const HELD_FROM_STATUSES = allowedFromStatusesFor("HELD");
// [Cross-lane fix, M3] Same derivation for the admin "the money arrived"
// confirmation — the SENT -> SETTLED edge the map has declared all along.
// Hand-typing `["SENT"]` here would be the exact dead-documentation-table
// failure settlement-transitions.ts exists to prevent.
const SETTLED_FROM_STATUSES = allowedFromStatusesFor("SETTLED");

function batchNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "SETTLEMENT_BATCH_NOT_FOUND",
    message: "Settlement batch not found.",
  });
}

/**
 * Admin/merchant-facing CRUD + the approve/hold/retry lifecycle actions
 * (brief §3). The actual money computation lives in
 * SettlementBatchBuilderService (recomputeBatch); the actual provider call
 * lives in SettlementPayoutService (executeOne) — this file orchestrates
 * both behind the guarded status transitions admin/merchant endpoints see.
 */
@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly batchBuilder: SettlementBatchBuilderService,
    private readonly payout: SettlementPayoutService,
  ) {}

  async adminList(
    status: SettlementStatus | undefined,
    merchantId: string | undefined,
    page: number,
    pageSize: number,
  ) {
    const where = {
      ...(status ? { status } : {}),
      ...(merchantId ? { merchantId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.settlementBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { merchant: { select: { tradeName: true } } },
      }),
      this.prisma.settlementBatch.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * [Cross-lane fix, I14] The batch detail — and the ONE settlements read
   * that hands an admin a merchant's full IBAN.
   *
   * MerchantsService.adminGetDetail already established the invariant for
   * this platform: bank/tax identity is only ever read together with an
   * AuditLog row written in the SAME transaction, so "who looked at this
   * merchant's bank details, and when" can always be answered. This
   * endpoint returned the same material with no trace at all — and it is
   * also the body of approve/hold/retry, so every money action leaked it
   * silently too. Now every path that returns it goes through here, and
   * every one of them records the read.
   *
   * The IBAN stays in the response deliberately (the finding's sketch
   * suggested dropping it): the admin finance queue renders it, and
   * marking a payout SETTLED means checking a bank statement against
   * exactly this number. Auditing the read is the control, not hiding it.
   */
  async adminGet(id: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.settlementBatch.findUnique({
        where: { id },
        include: {
          // Exactly the three fields SettlementDetailPage renders — a
          // narrower select than the screen would tolerate is not
          // possible, and a wider one (mersisNo, kepAddress, ownerName,
          // contact email/phone) would be PII this screen never shows.
          merchant: {
            select: { tradeName: true, legalName: true, iban: true },
          },
          settlementLines: { orderBy: { redeemedAt: "asc" } },
          commissionInvoices: true,
        },
      });
      if (!batch) throw batchNotFoundError();
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          action: "merchant.bank_details.viewed",
          entity: "Merchant",
          entityId: batch.merchantId,
          diffJson: { via: "settlement.detail", batchId: id },
        },
      });
      return batch;
    });
  }

  /** Recomputes once more (picking up anything that changed since the
   * batch was last touched — a very-late refund, a bag-fee override edit)
   * before locking it in; only proceeds to APPROVED if that recompute
   * lands on CALCULATED (not HELD).
   *
   * [Fix round #6, I5] Takes the acting admin and records them. APPROVED
   * is precisely what the payout cron picks up to move money to a
   * merchant's IBAN, and this was one of five admin mutations — the only
   * ones in the codebase — that left no trace of who acted. The guarded
   * updateMany and the AuditLog row now commit together: an approval
   * without a record of its author is the state this fix exists to make
   * unreachable. */
  async adminApprove(id: string, adminId: string, now: Date = new Date()) {
    const existing = await this.prisma.settlementBatch.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) throw batchNotFoundError();
    if (!APPROVED_FROM_STATUSES.includes(existing.status)) {
      throw new ConflictException({
        statusCode: 409,
        errorCode: "SETTLEMENT_NOT_APPROVABLE",
        message: `Batch is ${existing.status}, which cannot be approved.`,
      });
    }

    const recomputed = await this.batchBuilder.recomputeBatch(id, now);
    if (recomputed.status !== "CALCULATED") {
      throw new ConflictException({
        statusCode: 409,
        errorCode: "SETTLEMENT_NOT_APPROVABLE",
        message: `Recompute moved the batch to ${recomputed.status} — cannot approve (see holdReason).`,
      });
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      const guarded = await tx.settlementBatch.updateMany({
        where: { id, status: { in: APPROVED_FROM_STATUSES } },
        data: { status: "APPROVED" },
      });
      if (guarded.count === 0) return false;
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          action: "settlement.approved",
          entity: "SettlementBatch",
          entityId: id,
          diffJson: {
            fromStatus: existing.status,
            toStatus: "APPROVED",
            netPayoutCents: recomputed.netPayoutCents,
            merchantId: recomputed.merchantId,
          },
        },
      });
      return true;
    });
    if (!approved) {
      throw new ConflictException({
        statusCode: 409,
        errorCode: "SETTLEMENT_NOT_APPROVABLE",
        message: "Batch was concurrently modified — retry.",
      });
    }
    return this.adminGet(id, adminId);
  }

  /** [Fix round, C3] Refuses a batch with `payoutAttemptedAt` set — once a
   * payout has been attempted, netPayoutCents must never move again; see
   * settlement-payout.service.ts's class doc comment for the exact money
   * bug this closes. An APPROVED batch that already has a payout in
   * flight/attempted cannot be held through this endpoint at all — it
   * needs a manual reconciliation path (out of this task's scope) once a
   * real bank/PSP feed exists, not a silent re-open. */
  async adminHold(id: string, note: string | undefined, adminId: string) {
    const holdReason = note?.trim() || "Admin tarafından beklemeye alındı";
    // [Fix round #6, I5] Guarded update + audit row in one transaction —
    // same shape as adminApprove.
    const guarded = await this.prisma.$transaction(async (tx) => {
      const result = await tx.settlementBatch.updateMany({
        where: {
          id,
          status: { in: HELD_FROM_STATUSES },
          payoutAttemptedAt: null,
        },
        data: { status: "HELD", holdReason },
      });
      if (result.count > 0) {
        await tx.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: adminId,
            action: "settlement.held",
            entity: "SettlementBatch",
            entityId: id,
            diffJson: { holdReason },
          },
        });
      }
      return result;
    });
    if (guarded.count === 0) {
      const existing = await this.prisma.settlementBatch.findUnique({
        where: { id },
        select: { status: true, payoutAttemptedAt: true },
      });
      if (!existing) throw batchNotFoundError();
      if (existing.payoutAttemptedAt !== null) {
        throw new ConflictException({
          statusCode: 409,
          errorCode: "SETTLEMENT_PAYOUT_ALREADY_ATTEMPTED",
          message:
            "A payout has already been attempted for this batch — its amount is frozen and it can no longer be held. Needs manual reconciliation, not a hold/retry.",
        });
      }
      throw new ConflictException({
        statusCode: 409,
        errorCode: "SETTLEMENT_NOT_HOLDABLE",
        message: `Batch is ${existing.status}, which cannot be held.`,
      });
    }
    return this.adminGet(id, adminId);
  }

  /** HELD -> recompute (may resolve back to CALCULATED, or stay HELD with
   * an updated shortfall). APPROVED -> retry the payout call right now
   * instead of waiting for the next cron tick. Anything else: 409. */
  async adminRetry(id: string, adminId: string, now: Date = new Date()) {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!batch) throw batchNotFoundError();

    if (batch.status === "HELD" || batch.status === "APPROVED") {
      // [Fix round #6, I5] Recorded BEFORE the action, and outside it: a
      // retry's effect is a recompute or a provider call, neither of
      // which can be wrapped in this transaction (provider I/O never runs
      // inside one, and recomputeBatch opens its own). What matters for
      // the audit trail is that an admin asked for it, which is true the
      // moment we get here.
      await this.prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          action: "settlement.retried",
          entity: "SettlementBatch",
          entityId: id,
          diffJson: { fromStatus: batch.status },
        },
      });
    }

    if (batch.status === "HELD") {
      await this.batchBuilder.recomputeBatch(id, now);
      return this.adminGet(id, adminId);
    }
    if (batch.status === "APPROVED") {
      await this.payout.executeOne(id);
      return this.adminGet(id, adminId);
    }
    throw new ConflictException({
      statusCode: 409,
      errorCode: "SETTLEMENT_NOT_RETRYABLE",
      message: `Batch is ${batch.status}; nothing to retry.`,
    });
  }

  /**
   * [Cross-lane fix, M3] SENT -> SETTLED: an admin confirming, from a
   * bank/PSP statement, that the transfer actually LANDED.
   *
   * This edge has been declared in SETTLEMENT_TRANSITIONS since the state
   * machine was written and had no writer, so "sent to the PSP" was the
   * furthest any payout ever got in this system's own books. Nothing
   * recorded arrival, and the daily reconciliation sweep's stale-SENT
   * branch therefore alerted on a state no action could clear.
   *
   * There is deliberately no automated feed behind this: no PSP adapter
   * exists yet, and inventing one would be pretending. What exists is the
   * human step the runbook already asks for (reconcile the statement),
   * made recordable.
   *
   * The guard is `allowedFromStatusesFor("SETTLED")` — the transitions map
   * driving enforcement, never a hand-typed `["SENT"]` that can drift from
   * it. Same guarded-updateMany + audit-row-in-one-transaction shape as
   * approve/hold: a confirmation that did not move the row records
   * nothing.
   */
  async adminMarkSettled(
    id: string,
    reference: string | undefined,
    adminId: string,
    now: Date = new Date(),
  ) {
    const settlementReference = reference?.trim() || null;
    const guarded = await this.prisma.$transaction(async (tx) => {
      const result = await tx.settlementBatch.updateMany({
        where: { id, status: { in: SETTLED_FROM_STATUSES } },
        data: { status: "SETTLED", settledAt: now, settlementReference },
      });
      if (result.count > 0) {
        const fresh = await tx.settlementBatch.findUniqueOrThrow({
          where: { id },
          select: { merchantId: true, netPayoutCents: true, sentAt: true },
        });
        await tx.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: adminId,
            action: "settlement.settled",
            entity: "SettlementBatch",
            entityId: id,
            diffJson: {
              toStatus: "SETTLED",
              merchantId: fresh.merchantId,
              netPayoutCents: fresh.netPayoutCents,
              sentAt: fresh.sentAt?.toISOString() ?? null,
              settledAt: now.toISOString(),
              settlementReference,
            },
          },
        });
      }
      return result;
    });

    if (guarded.count === 0) {
      const existing = await this.prisma.settlementBatch.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!existing) throw batchNotFoundError();
      throw new ConflictException({
        statusCode: 409,
        errorCode: "SETTLEMENT_NOT_SETTLEABLE",
        message: `Batch is ${existing.status}; only a SENT batch can be confirmed as settled.`,
      });
    }
    return this.adminGet(id, adminId);
  }

  /** [Fix round, C1] On-demand trigger for the nightly batch cycle
   * (POST /api/admin/settlements/run-nightly) — the cron itself
   * (settlement-batch-builder.service.ts's runNightlyCycleCron) covers the
   * normal 02:00 Europe/Istanbul schedule; this is for ops to run it
   * immediately (verifying a fix, catching up after an incident) without
   * waiting for the next tick. */
  async adminRunNightlyCycle(adminId: string, now: Date = new Date()) {
    const result = await this.batchBuilder.runNightlyCycle(now);
    // [Fix round #6, I5] Platform-wide, so the entity is the CYCLE (keyed
    // by its Istanbul day) rather than any one batch; the batches it
    // touched and the merchants it could not settle are the diff. Written
    // after the fact deliberately — the cycle's own per-merchant
    // isolation means "what actually happened" is only known here.
    await this.prisma.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: adminId,
        action: "settlement.nightly_run",
        entity: "SettlementCycle",
        entityId: istanbulDateKey(now),
        diffJson: {
          batchIds: result.batchIds,
          failures: result.failures as unknown as Prisma.InputJsonValue,
        },
      },
    });
    return result;
  }

  async listMine(merchantId: string, page: number, pageSize: number) {
    const where = { merchantId };
    const [items, total] = await Promise.all([
      this.prisma.settlementBatch.findMany({
        where,
        orderBy: { periodStart: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.settlementBatch.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getMineDetail(merchantId: string, id: string) {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id },
      include: {
        settlementLines: { orderBy: { redeemedAt: "asc" } },
        commissionInvoices: true,
      },
    });
    if (!batch || batch.merchantId !== merchantId) throw batchNotFoundError();
    return batch;
  }
}
