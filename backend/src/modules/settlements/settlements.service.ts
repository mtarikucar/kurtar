import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SettlementStatus } from "@prisma/client";
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

  async adminGet(id: string) {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id },
      include: {
        merchant: { select: { tradeName: true, legalName: true, iban: true } },
        settlementLines: { orderBy: { redeemedAt: "asc" } },
        commissionInvoices: true,
      },
    });
    if (!batch) throw batchNotFoundError();
    return batch;
  }

  /** Recomputes once more (picking up anything that changed since the
   * batch was last touched — a very-late refund, a bag-fee override edit)
   * before locking it in; only proceeds to APPROVED if that recompute
   * lands on CALCULATED (not HELD). */
  async adminApprove(id: string, now: Date = new Date()) {
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

    const guarded = await this.prisma.settlementBatch.updateMany({
      where: { id, status: { in: APPROVED_FROM_STATUSES } },
      data: { status: "APPROVED" },
    });
    if (guarded.count === 0) {
      throw new ConflictException({
        statusCode: 409,
        errorCode: "SETTLEMENT_NOT_APPROVABLE",
        message: "Batch was concurrently modified — retry.",
      });
    }
    return this.adminGet(id);
  }

  /** [Fix round, C3] Refuses a batch with `payoutAttemptedAt` set — once a
   * payout has been attempted, netPayoutCents must never move again; see
   * settlement-payout.service.ts's class doc comment for the exact money
   * bug this closes. An APPROVED batch that already has a payout in
   * flight/attempted cannot be held through this endpoint at all — it
   * needs a manual reconciliation path (out of this task's scope) once a
   * real bank/PSP feed exists, not a silent re-open. */
  async adminHold(id: string, note: string | undefined) {
    const guarded = await this.prisma.settlementBatch.updateMany({
      where: {
        id,
        status: { in: HELD_FROM_STATUSES },
        payoutAttemptedAt: null,
      },
      data: {
        status: "HELD",
        holdReason: note?.trim() || "Admin tarafından beklemeye alındı",
      },
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
    return this.adminGet(id);
  }

  /** HELD -> recompute (may resolve back to CALCULATED, or stay HELD with
   * an updated shortfall). APPROVED -> retry the payout call right now
   * instead of waiting for the next cron tick. Anything else: 409. */
  async adminRetry(id: string, now: Date = new Date()) {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!batch) throw batchNotFoundError();

    if (batch.status === "HELD") {
      await this.batchBuilder.recomputeBatch(id, now);
      return this.adminGet(id);
    }
    if (batch.status === "APPROVED") {
      await this.payout.executeOne(id);
      return this.adminGet(id);
    }
    throw new ConflictException({
      statusCode: 409,
      errorCode: "SETTLEMENT_NOT_RETRYABLE",
      message: `Batch is ${batch.status}; nothing to retry.`,
    });
  }

  /** [Fix round, C1] On-demand trigger for the nightly batch cycle
   * (POST /api/admin/settlements/run-nightly) — the cron itself
   * (settlement-batch-builder.service.ts's runNightlyCycleCron) covers the
   * normal 02:00 Europe/Istanbul schedule; this is for ops to run it
   * immediately (verifying a fix, catching up after an incident) without
   * waiting for the next tick. */
  async adminRunNightlyCycle(now: Date = new Date()) {
    return this.batchBuilder.runNightlyCycle(now);
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
