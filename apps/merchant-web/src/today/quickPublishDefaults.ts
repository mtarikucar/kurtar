/**
 * Remembers, per bag template, the quantity and pickup window a merchant
 * last used to publish — the "last used quantity"/"the template's usual
 * pickup window" defaults the brief asks one-tap publish to pre-fill.
 *
 * The backend has no endpoint that exposes offer HISTORY by template
 * (GET /offers/mine is scoped to a single date, never a range or a
 * template filter — see backend/src/modules/offers/offers.service.ts's
 * listMine), so there is nothing to derive this from server-side without a
 * new backend endpoint (flagged in the task report). This is the honest,
 * documented alternative: remember it client-side, keyed by merchant so a
 * shared browser/device never leaks one merchant's usual quantities into
 * another's session. Pure functions, no React — easy to unit test and easy
 * to swap for a server-backed version later without touching callers.
 */

const STORAGE_PREFIX = "kurtar:merchant-web:quick-publish-defaults:v1";

export interface QuickPublishDefault {
  qtyTotal: number;
  /** "HH:mm", Europe/Istanbul local time. */
  startTime: string;
  endTime: string;
}

interface StoredDefaults {
  lastTemplateId?: string;
  perTemplate: Record<string, QuickPublishDefault>;
}

/** First-ever publish for a merchant with no history yet — a generic,
 * plausible end-of-day pickup window rather than an empty form. */
export const FALLBACK_DEFAULT: QuickPublishDefault = {
  qtyTotal: 5,
  startTime: "19:00",
  endTime: "21:00",
};

function storageKey(merchantId: string): string {
  return `${STORAGE_PREFIX}:${merchantId}`;
}

function readAll(merchantId: string): StoredDefaults {
  try {
    const raw = window.localStorage.getItem(storageKey(merchantId));
    if (!raw) return { perTemplate: {} };
    const parsed = JSON.parse(raw) as Partial<StoredDefaults>;
    return {
      lastTemplateId: parsed.lastTemplateId,
      perTemplate: parsed.perTemplate ?? {},
    };
  } catch {
    return { perTemplate: {} };
  }
}

function writeAll(merchantId: string, data: StoredDefaults): void {
  try {
    window.localStorage.setItem(storageKey(merchantId), JSON.stringify(data));
  } catch {
    // Storage unavailable (private browsing, quota) — quick-publish still
    // works, it just falls back to FALLBACK_DEFAULT every time instead of
    // remembering. Never let a storage failure break the publish flow.
  }
}

export function getQuickPublishDefault(
  merchantId: string,
  templateId: string,
): QuickPublishDefault {
  return readAll(merchantId).perTemplate[templateId] ?? FALLBACK_DEFAULT;
}

export function saveQuickPublishDefault(
  merchantId: string,
  templateId: string,
  value: QuickPublishDefault,
): void {
  const all = readAll(merchantId);
  all.perTemplate[templateId] = value;
  all.lastTemplateId = templateId;
  writeAll(merchantId, all);
}

/** The template to preselect when a merchant has more than one — whichever
 * they last published from, so returning to publish "the usual" the next
 * day needs no picking at all. */
export function getLastTemplateId(merchantId: string): string | undefined {
  return readAll(merchantId).lastTemplateId;
}
