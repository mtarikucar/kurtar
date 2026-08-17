/** Substitutes `{param}` placeholders in an OpenAPI path template, e.g. "/api/offers/{id}/cancel" + {id: "abc"} -> "/api/offers/abc/cancel". */
export function buildPath(
  template: string,
  params?: Record<string, string | number | undefined>,
): string {
  if (!params) return template;
  return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const value = params[key];
    if (value === undefined || value === null) {
      throw new Error(
        `Missing required path parameter "${key}" for "${template}".`,
      );
    }
    return encodeURIComponent(String(value));
  });
}

/** Builds a "?a=1&b=2" query string, dropping undefined/null values and expanding arrays as repeated keys. */
export function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        params.append(key, String(item));
      }
    } else {
      params.append(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}
