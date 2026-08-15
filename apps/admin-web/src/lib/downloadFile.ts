/** Triggers a browser download of in-memory text content — used for the
 * three CSV exports, whose content the API client already returns as a
 * plain string (docs/frontend-contract.md: the three exports are typed as
 * `string`, not JSON). No network re-fetch, no server-rendered download
 * link — the content is already in hand, this just hands it to the
 * browser's normal save flow. */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "text/csv;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
