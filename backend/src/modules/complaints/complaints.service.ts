import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ComplaintCategory,
  ComplaintStatus,
  ComplaintTicket,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthenticatedPrincipal } from "../auth/strategies/jwt.strategy";
import { ReservationsService } from "../reservations/reservations.service";
import { CreateComplaintDto } from "./dto/create-complaint.dto";
import { allowedFromStatusesFor } from "./complaint-transitions";
import { computeComplaintSlaDeadline } from "./sla-date-math";

function complaintNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "COMPLAINT_NOT_FOUND",
    message: "Complaint not found.",
  });
}

function notOwnerError() {
  return new ForbiddenException({
    statusCode: 403,
    errorCode: "FORBIDDEN",
    message: "This complaint does not belong to you.",
  });
}

function notAssignedError() {
  return new ForbiddenException({
    statusCode: 403,
    errorCode: "FORBIDDEN",
    message: "This complaint is not assigned to your store.",
  });
}

function reservationNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "RESERVATION_NOT_FOUND",
    message: "Reservation not found.",
  });
}

function merchantNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "MERCHANT_NOT_FOUND",
    message: "Merchant not found.",
  });
}

function transitionInvalidError(current: ComplaintStatus, to: ComplaintStatus) {
  return new ConflictException({
    statusCode: 409,
    errorCode: "COMPLAINT_TRANSITION_INVALID",
    message: `Complaint is in ${current}, which cannot transition to ${to}.`,
  });
}

/** [I3 fix] adminRefund's guard error — no reservation is linked to this
 * complaint, so there is nothing to refund. */
function noLinkedReservationError() {
  return new ConflictException({
    statusCode: 409,
    errorCode: "COMPLAINT_NO_RESERVATION",
    message: "This complaint has no linked reservation to refund.",
  });
}

/** [I3 fix] adminRefund's single-fire guard error — this ticket already
 * triggered a refund (or is doing so concurrently right now). */
function alreadyRefundedError() {
  return new ConflictException({
    statusCode: 409,
    errorCode: "COMPLAINT_ALREADY_REFUNDED",
    message: "This complaint has already triggered a refund.",
  });
}

/**
 * Complaints — the ETAHS 15-calendar-day SLA (§4 of the brief). Every
 * status change is a compound-WHERE guarded update deriving its "from"
 * list from complaint-transitions.ts, matching this codebase's
 * established transitions-map-drives-enforcement pattern.
 *
 * Authorization matrix for the message thread (addMessage) — the "who
 * may post to which thread" the brief asks for: CONSUMER must own the
 * complaint; MERCHANT must be the complaint's assigned merchantId;
 * ADMIN may post to any thread. A MERCHANT's reply ALSO flips
 * OPEN -> MERCHANT_RESPONDED (the brief's "reply sets status
 * MERCHANT_RESPONDED") — there is no separate reply endpoint, this
 * message endpoint IS the reply mechanism for every actor.
 */
@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
  ) {}

  async create(
    userId: string,
    dto: CreateComplaintDto,
  ): Promise<ComplaintTicket> {
    let merchantId: string | null = dto.merchantId ?? null;
    const reservationId: string | null = dto.reservationId ?? null;

    if (reservationId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: reservationId },
        select: {
          id: true,
          userId: true,
          store: { select: { merchantId: true } },
        },
      });
      if (!reservation) throw reservationNotFoundError();
      if (reservation.userId !== userId) throw notOwnerError();
      // Authoritative — derived from the reservation, overriding any
      // client-supplied merchantId that might disagree with it.
      merchantId = reservation.store.merchantId;
    } else if (merchantId) {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { id: true },
      });
      if (!merchant) throw merchantNotFoundError();
    }

    const now = new Date();
    return this.prisma.complaintTicket.create({
      data: {
        userId,
        merchantId,
        reservationId,
        category: dto.category,
        description: dto.description,
        slaDeadlineAt: computeComplaintSlaDeadline(now),
      },
    });
  }

  async listMine(userId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.complaintTicket.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.complaintTicket.count({ where: { userId } }),
    ]);
    return { items, total, page, pageSize };
  }

  async getMine(userId: string, id: string) {
    const complaint = await this.getWithMessages(id);
    if (complaint.userId !== userId) throw notOwnerError();
    return complaint;
  }

  async listAssigned(
    merchantId: string,
    status: ComplaintStatus | undefined,
    page: number,
    pageSize: number,
  ) {
    const where = { merchantId, ...(status && { status }) };
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.complaintTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.complaintTicket.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** [I18 fix] The merchant-scoped mirror of getMine — GET
   * /complaints/assigned/:id (MerchantComplaintsController). merchant-web
   * used to call the CONSUMER-only GET /complaints/:id and get 403'd on
   * every ticket; this is the read-side counterpart to addMessage's own
   * MERCHANT branch, which was already open. */
  async getAssigned(merchantId: string, id: string) {
    const complaint = await this.getWithMessages(id);
    if (!complaint.merchantId || complaint.merchantId !== merchantId) {
      throw notAssignedError();
    }
    return complaint;
  }

  async addMessage(
    user: AuthenticatedPrincipal,
    complaintId: string,
    body: string,
  ) {
    const complaint = await this.prisma.complaintTicket.findUnique({
      where: { id: complaintId },
    });
    if (!complaint) throw complaintNotFoundError();
    this.assertCanMessage(user, complaint);

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.complaintMessage.create({
        data: {
          complaintId,
          authorType: user.actor,
          authorId: user.id,
          body,
        },
      });

      if (user.actor === "MERCHANT") {
        await tx.complaintTicket.updateMany({
          where: {
            id: complaintId,
            status: { in: allowedFromStatusesFor("MERCHANT_RESPONDED") },
          },
          data: { status: "MERCHANT_RESPONDED" },
        });
      }

      return message;
    });
  }

  private assertCanMessage(
    user: AuthenticatedPrincipal,
    complaint: ComplaintTicket,
  ): void {
    if (user.actor === "ADMIN") return;
    if (user.actor === "CONSUMER") {
      if (complaint.userId !== user.id) throw notOwnerError();
      return;
    }
    if (user.actor === "MERCHANT") {
      if (!complaint.merchantId || complaint.merchantId !== user.merchantId) {
        throw notAssignedError();
      }
      return;
    }
    throw notOwnerError();
  }

  async adminList(
    status: ComplaintStatus | undefined,
    merchantId: string | undefined,
    category: ComplaintCategory | undefined,
    page: number,
    pageSize: number,
  ) {
    const where = {
      ...(status && { status }),
      ...(merchantId && { merchantId }),
      ...(category && { category }),
    };
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.complaintTicket.findMany({
        where,
        orderBy: { slaDeadlineAt: "asc" },
        skip,
        take: pageSize,
      }),
      this.prisma.complaintTicket.count({ where }),
    ]);
    const now = Date.now();
    const items = rows.map((c) => ({
      ...c,
      slaCountdownMs: c.slaDeadlineAt.getTime() - now,
    }));
    return { items, total, page, pageSize };
  }

  async adminGet(id: string) {
    return this.getWithMessages(id);
  }

  async adminResolve(adminId: string, id: string, note: string | undefined) {
    return this.transitionAsAdmin(
      adminId,
      id,
      "RESOLVED",
      "complaint.resolve",
      note,
    );
  }

  async adminEscalate(adminId: string, id: string, note: string | undefined) {
    return this.transitionAsAdmin(
      adminId,
      id,
      "ESCALATED",
      "complaint.escalate",
      note,
    );
  }

  /**
   * [I3 fix] The complaint-resolution refund action — the only production
   * entry point for refunding a REDEEMED reservation (see
   * ReservationsService.refundRedeemed's own doc comment). Does NOT
   * transition the complaint's own status (an admin may still separately
   * resolve/escalate it); this only moves money.
   *
   * `refundedAt` (NULL -> now, guarded) is this ticket's single-fire
   * claim, atomically taken BEFORE calling into ReservationsService — a
   * REDEEMED reservation has no status transition of its own to
   * piggyback that guarantee on (see refundRedeemed's doc comment), so
   * the guard has to live somewhere, and the acting complaint ticket is
   * the natural place: it also means the SAME complaint can't trigger two
   * refunds. Released back to NULL if the provider call itself fails, so
   * a retry through the same ticket stays possible.
   */
  async adminRefund(adminId: string, id: string) {
    const complaint = await this.prisma.complaintTicket.findUnique({
      where: { id },
    });
    if (!complaint) throw complaintNotFoundError();
    if (!complaint.reservationId) throw noLinkedReservationError();

    const claimed = await this.prisma.complaintTicket.updateMany({
      where: { id, refundedAt: null },
      data: { refundedAt: new Date() },
    });
    if (claimed.count === 0) throw alreadyRefundedError();

    const outcome = await this.reservations.refundRedeemed(
      complaint.reservationId,
    );

    if (!outcome.ok) {
      // No money moved — release the ticket-level claim so a retry
      // through this same ticket is possible (mirrors
      // ReservationsService.refundRedeemed's own Payment-level release
      // for the identical reason).
      await this.prisma.complaintTicket
        .updateMany({
          where: { id, refundedAt: { not: null } },
          data: { refundedAt: null },
        })
        .catch(() => undefined);
      return { ...outcome, reservationId: complaint.reservationId };
    }

    await this.prisma.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: adminId,
        action: "complaint.refund",
        entity: "ComplaintTicket",
        entityId: id,
        diffJson: {
          reservationId: complaint.reservationId,
          refundRef: outcome.refundRef ?? null,
        },
      },
    });

    return { ...outcome, reservationId: complaint.reservationId };
  }

  private async getWithMessages(id: string) {
    const complaint = await this.prisma.complaintTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!complaint) throw complaintNotFoundError();
    return complaint;
  }

  private async transitionAsAdmin(
    adminId: string,
    id: string,
    to: ComplaintStatus,
    action: string,
    note: string | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.complaintTicket.findUnique({ where: { id } });
      if (!current) throw complaintNotFoundError();

      const updated = await tx.complaintTicket.updateMany({
        where: { id, status: { in: allowedFromStatusesFor(to) } },
        data: {
          status: to,
          ...(to === "RESOLVED" && { resolvedAt: new Date() }),
        },
      });
      if (updated.count === 0) {
        throw transitionInvalidError(current.status, to);
      }

      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          action,
          entity: "ComplaintTicket",
          entityId: id,
          diffJson: { from: current.status, to, note: note ?? null },
        },
      });

      return tx.complaintTicket.findUniqueOrThrow({ where: { id } });
    });
  }
}
