/**
 * Validates the `{from, to}` date-range pair used by the three CSV exports
 * (GET /admin/exports/{complaints,settlements,merchants}.csv?from=&to=).
 * Both ends are required (the brief calls for an EXPLICIT range, not an
 * unbounded "export everything" default) and `from` must not be after
 * `to`. Dates are plain `YYYY-MM-DD` strings from a native `<input
 * type="date">` — compared lexicographically, which is valid for that
 * exact format.
 */
export type ExportDateRangeError =
  "MISSING_FROM" | "MISSING_TO" | "FROM_AFTER_TO" | null;

export function validateExportDateRange(
  from: string,
  to: string,
): ExportDateRangeError {
  if (from.length === 0) return "MISSING_FROM";
  if (to.length === 0) return "MISSING_TO";
  if (from > to) return "FROM_AFTER_TO";
  return null;
}
