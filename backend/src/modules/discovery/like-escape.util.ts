/**
 * Escapes LIKE/ILIKE pattern metacharacters (`\`, `%`, `_`) in a raw user
 * search term so it can be safely wrapped in `%...%` and bound as a
 * parameter to Postgres's ILIKE. This is NOT about SQL injection (the
 * value is always parameter-bound via Prisma.sql, never string-
 * interpolated into SQL text) — it's about LIKE PATTERN injection: `%`
 * and `_` are wildcards to the pattern matcher itself, so an unescaped
 * `?q=%` would match every title (empty string between the two added `%`
 * wildcards is itself a wildcard), and a genuine search for a title
 * containing a literal `%` (e.g. "50% İndirim") would silently fail to
 * match. Escaping `\` FIRST is required so a value that already contains
 * a literal backslash doesn't get double-unescaped.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
