import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { istanbulDateKey } from "../../common/utils/istanbul-date.util";

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
  private cache: Set<string> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Every seeded holiday date, as Istanbul calendar-day keys. Cached in
   * memory after the first call; call `invalidate()` after writing the
   * table to force the next call to re-query. */
  async getHolidayDateKeys(): Promise<ReadonlySet<string>> {
    if (this.cache) return this.cache;

    const rows = await this.prisma.publicHoliday.findMany({
      select: { date: true },
    });
    this.cache = new Set(rows.map((r) => istanbulDateKey(r.date)));
    return this.cache;
  }

  invalidate(): void {
    this.cache = null;
  }
}
