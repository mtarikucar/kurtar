import { Response } from "express";

/**
 * The single CSV helper every admin export (complaints/settlements/
 * merchants — modules/admin/admin-exports.controller.ts) reuses, so
 * escaping/streaming behavior lives in exactly one place. Task 9 brief:
 * "streaming, not buffered" — streamCsv never materializes the full
 * result set in memory; it pages through `fetchPage` (a bounded
 * skip/take query the caller owns) and writes each page's rows to the
 * response as it goes, so a large export's memory footprint is bounded by
 * `pageSize`, not by the total row count.
 */

/** RFC 4180 field escaping: wrap in quotes (doubling any embedded quote)
 * whenever the value contains a comma, quote, or newline — the exact
 * three characters that would otherwise corrupt the CSV structure. */
export function csvEscapeField(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function csvRow(
  fields: Array<string | number | null | undefined>,
): string {
  return fields.map(csvEscapeField).join(",") + "\r\n";
}

const DEFAULT_CSV_PAGE_SIZE = 500;

/**
 * Streams a CSV file to `res`: writes the header, then repeatedly calls
 * `fetchPage(skip, take)` and writes each returned row until a page comes
 * back shorter than `pageSize` (end of data). `res` must be the raw
 * Express response (`@Res({ passthrough: false })` in the controller) —
 * this function owns the response lifecycle end-to-end, including the
 * final `res.end()`.
 */
export async function streamCsv<T>(
  res: Response,
  filename: string,
  header: string[],
  fetchPage: (skip: number, take: number) => Promise<T[]>,
  toRow: (item: T) => Array<string | number | null | undefined>,
  pageSize: number = DEFAULT_CSV_PAGE_SIZE,
): Promise<void> {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.write(csvRow(header));

  let skip = 0;
  for (;;) {
    const page = await fetchPage(skip, pageSize);
    for (const item of page) {
      res.write(csvRow(toRow(item)));
    }
    if (page.length < pageSize) break;
    skip += page.length;
  }
  res.end();
}
