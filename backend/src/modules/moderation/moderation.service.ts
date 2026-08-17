import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ContentReport, ReportStatus, ReportTargetType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RatingsService } from "../ratings/ratings.service";
import { StoresService } from "../stores/stores.service";
import { OffersService } from "../offers/offers.service";
import { CreateReportDto } from "./dto/create-report.dto";
import { computeTakedownDeadline } from "./takedown-date-math";

function reportNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "REPORT_NOT_FOUND",
    message: "Report not found.",
  });
}

function reportAlreadyHandledError(status: ReportStatus) {
  return new ConflictException({
    statusCode: 409,
    errorCode: "REPORT_ALREADY_HANDLED",
    message: `This report has already been ${status === "ACTIONED" ? "actioned" : "dismissed"}.`,
  });
}

/**
 * Content reports — the 48h takedown SLA (§5 of the brief). `action`
 * genuinely acts: it dispatches to the ONE reused entry point per target
 * type — RatingsService.rejectRating (RATING), StoresService.
 * adminDeactivate (STORE), OffersService.adminCancel (OFFER) — never a
 * second copy of any of those three's own logic. Each of those methods
 * writes its OWN AuditLog row (on its OWN entity) inside its OWN
 * transaction; this service additionally writes a SEPARATE AuditLog row
 * on the ContentReport entity itself once the report's status flips,
 * since a report and its target are two different entities with two
 * different audit stories ("this report was actioned" vs. "this rating
 * was rejected").
 *
 * `@Public` justification for POST /api/reports (brief: "pick and
 * justify"): discovery itself is already @Public (browsing needs no
 * account), so gating "report this" behind a login wall would mean the
 * exact audience most likely to spot bad content (a browsing-but-not-yet-
 * signed-up visitor) has no way to flag it. The blast radius of an
 * anonymous false report is small and bounded: a report NEVER
 * auto-acts — it only ever opens a queue entry an admin must explicitly
 * review and act on (reports.controller.ts throttles the endpoint
 * heavily as the primary abuse control).
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ratings: RatingsService,
    private readonly stores: StoresService,
    private readonly offers: OffersService,
  ) {}

  async create(dto: CreateReportDto): Promise<ContentReport> {
    const now = new Date();
    return this.prisma.contentReport.create({
      data: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        takedownDeadlineAt: computeTakedownDeadline(now),
      },
    });
  }

  async adminList(
    status: ReportStatus | undefined,
    targetType: ReportTargetType | undefined,
    page: number,
    pageSize: number,
  ) {
    const where = {
      ...(status && { status }),
      ...(targetType && { targetType }),
    };
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.contentReport.findMany({
        where,
        orderBy: { takedownDeadlineAt: "asc" },
        skip,
        take: pageSize,
      }),
      this.prisma.contentReport.count({ where }),
    ]);
    const now = Date.now();
    const items = rows.map((r) => ({
      ...r,
      takedownCountdownMs: r.takedownDeadlineAt.getTime() - now,
    }));
    return { items, total, page, pageSize };
  }

  /**
   * Dispatches the actual moderation action, THEN claims the report as
   * ACTIONED. Order matters: if the target mutation throws, the report
   * stays OPEN so an admin can retry or dismiss instead — the report is
   * never marked "handled" for an action that didn't actually happen.
   *
   * [Fix round, Minor] The OFFER branch is the one exception to "throws
   * leave the report OPEN for a retry": tryAdminCancelOffer below treats
   * an already-terminal offer (OFFER_NOT_CANCELLABLE) as an acceptable
   * no-op rather than a failure, specifically so a genuine retry after a
   * partial success doesn't get stuck forever — see its own doc comment.
   */
  async adminAction(
    adminId: string,
    reportId: string,
    note: string | undefined,
  ): Promise<ContentReport> {
    const report = await this.prisma.contentReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw reportNotFoundError();
    if (report.status !== "OPEN")
      throw reportAlreadyHandledError(report.status);

    switch (report.targetType) {
      case "RATING":
        await this.ratings.rejectRating(adminId, report.targetId);
        break;
      case "STORE":
        await this.stores.adminDeactivate(adminId, report.targetId);
        break;
      case "OFFER":
        await this.tryAdminCancelOffer(adminId, report.targetId, reportId);
        break;
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.contentReport.updateMany({
        where: { id: reportId, status: "OPEN" },
        data: { status: "ACTIONED", resolvedAt: now },
      });
      if (updated.count > 0) {
        await tx.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: adminId,
            action: "report.action",
            entity: "ContentReport",
            entityId: reportId,
            diffJson: {
              targetType: report.targetType,
              targetId: report.targetId,
              note: note ?? null,
            },
          },
        });
      } else {
        // The target mutation above already happened and is real — a
        // race that claimed the report's own status in between is a
        // benign "someone else got here first" bookkeeping detail, not a
        // reason to tell the admin their action failed.
        this.logger.warn(
          `report ${reportId}: target action completed but the report was already claimed by another request — leaving its status as-is.`,
        );
      }
      return tx.contentReport.findUniqueOrThrow({ where: { id: reportId } });
    });
  }

  /**
   * [Fix round, Minor] adminCancel -> cancelOne throws OFFER_NOT_CANCELLABLE
   * once an offer is already in a terminal state (CANCELLED or CLOSED —
   * offer-transitions.ts's OFFER_TRANSITIONS has both mapped to `[]`, no
   * further transitions). Unlike RatingsService.rejectRating (an explicit
   * `if (rating.moderationStatus === to) return rating;` idempotent
   * no-op) and StoresService.adminDeactivate (unconditionally re-settable,
   * never throws), OffersService's guarded transition update was the ONE
   * of the three target-type handlers that could throw on a repeat call —
   * and that throw used to propagate straight out of adminAction BEFORE
   * the report's own status transaction ran below. That is a genuine
   * retry hazard: a transient failure strictly BETWEEN a successful
   * cancel and the report-claim transaction (a dropped DB connection, a
   * pod restart) left the report stuck OPEN forever — every retry hits
   * the exact same "already cancelled" 409, and the only way an admin
   * could clear it was `dismiss`, which is semantically wrong (the
   * report was never actually invalid; the target action just already
   * happened). Both CANCELLED and CLOSED mean the offer is no longer
   * live on the platform either way, which is the actual outcome a
   * content report against an OFFER exists to achieve — so this treats
   * ONLY that specific error as an acceptable no-op and lets adminAction
   * continue on to claim the report. Any OTHER failure (offer not found,
   * a genuine DB error, etc.) still propagates normally and still leaves
   * the report OPEN for a real retry, exactly as before.
   */
  private async tryAdminCancelOffer(
    adminId: string,
    offerId: string,
    reportId: string,
  ): Promise<void> {
    try {
      await this.offers.adminCancel(adminId, offerId);
    } catch (err) {
      const response =
        err instanceof ConflictException ? err.getResponse() : undefined;
      const errorCode =
        typeof response === "object" && response !== null
          ? (response as { errorCode?: string }).errorCode
          : undefined;
      if (errorCode === "OFFER_NOT_CANCELLABLE") {
        this.logger.warn(
          `report ${reportId}: offer ${offerId} is already in a terminal (non-cancellable) state — treating as already-actioned instead of blocking the report from being claimed.`,
        );
        return;
      }
      throw err;
    }
  }

  async adminDismiss(
    adminId: string,
    reportId: string,
    note: string | undefined,
  ): Promise<ContentReport> {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.contentReport.findUnique({
        where: { id: reportId },
      });
      if (!report) throw reportNotFoundError();
      if (report.status !== "OPEN")
        throw reportAlreadyHandledError(report.status);

      const now = new Date();
      await tx.contentReport.update({
        where: { id: reportId },
        data: { status: "DISMISSED", resolvedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          action: "report.dismiss",
          entity: "ContentReport",
          entityId: reportId,
          diffJson: { note: note ?? null },
        },
      });
      return tx.contentReport.findUniqueOrThrow({ where: { id: reportId } });
    });
  }
}
