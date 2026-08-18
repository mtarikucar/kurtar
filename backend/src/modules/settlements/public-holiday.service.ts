import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { istanbulDateKey } from "../../common/utils/istanbul-date.util";

/** [Fix round #6, M6] How close the calendar may get to running out
 * before this service starts saying so. Six months is comfortably more
 * than the lead time needed to re-verify the next year's bayram dates
 * against Diyanet (they move with the lunar calendar and the final dates
 * are confirmed by moon sighting) and ship a seed migration. */
const HOLIDAY_CALENDAR_MIN_HORIZON_MS = 182 * 24 * 60 * 60 * 1000;

/**
 * Thin caller-facing wrapper around the `public_holidays` table
 * (business-days.ts stays pure/DB-free — see that file's doc comment).
 * In-memory cache of every seeded holiday date, as "YYYY-MM-DD" Istanbul
 * calendar keys, invalidated on write (`invalidate()`), refreshed lazily
 * on next read. There is no admin CRUD surface over this table in Task 8
 * (brief §1 only asks for the seed migration + this read/cache service) —
 * `invalidate()` exists for whichever future admin endpoint adds/removes a
 * holiday row directly, and is exercised by this file's own spec.
 */
@Injectable()
export class PublicHolidayService {
  private readonly logger = new Logger(PublicHolidayService.name);
  private cache: Set<string> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Every seeded holiday date, as Istanbul calendar-day keys. Cached in
   * memory after the first call; call `invalidate()` after writing the
   * table to force the next call to re-query.
   *
   * [Fix round #6, M6] Warns when the seeded calendar is about to run
   * out. The table is populated by ONE migration and stops at
   * 2027-10-29; there is no admin CRUD over it and no runbook item to
   * re-seed. Once the last row is in the past, `isBusinessDay` silently
   * treats every bayram as an ordinary working day, and dueAt — the
   * 5-business-day payout deadline the platform commits to — lands too
   * early, with nothing anywhere announcing that it happened. A log line
   * on every cache refresh (so: at least once per process, and after any
   * invalidate) is the cheapest way for the gap to announce itself; the
   * matching re-seed item now lives in docs/operations.md. */
  async getHolidayDateKeys(): Promise<ReadonlySet<string>> {
    if (this.cache) return this.cache;

    const rows = await this.prisma.publicHoliday.findMany({
      select: { date: true },
    });
    this.cache = new Set(rows.map((r) => istanbulDateKey(r.date)));
    this.warnIfCalendarRunningOut(rows.map((r) => r.date));
    return this.cache;
  }

  private warnIfCalendarRunningOut(dates: Date[]): void {
    const horizon = Date.now() + HOLIDAY_CALENDAR_MIN_HORIZON_MS;
    const latest = dates.reduce(
      (max, d) => (d.getTime() > max ? d.getTime() : max),
      0,
    );
    if (latest === 0) {
      this.logger.error(
        "CRITICAL: the public_holidays table is EMPTY — every settlement dueAt is being computed as if no Turkish public holiday exists, so payout deadlines land too early. Seed the calendar (see docs/operations.md, 'Public holiday calendar').",
      );
      return;
    }
    if (latest < horizon) {
      this.logger.warn(
        `The seeded public holiday calendar ends on ${istanbulDateKey(new Date(latest))}, less than ${Math.round(HOLIDAY_CALENDAR_MIN_HORIZON_MS / 86_400_000)} days out. Settlement dueAt dates past that point will treat every bayram as a working day. Re-verify the next year's dates against Diyanet and ship a seed migration — see docs/operations.md, "Public holiday calendar".`,
      );
    }
  }

  invalidate(): void {
    this.cache = null;
  }
}
