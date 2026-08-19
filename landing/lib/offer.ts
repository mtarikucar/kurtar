import { createClient } from "@kurtar/api-client";

/**
 * The share-link bridge page's own read: `GET /discovery/offers/{id}`,
 * the public single-offer lookup (backend's discovery.controller.ts,
 * `@Get("offers/:id")`). apps/consumer's own /o/[id] screen has been
 * calling it through `client.discovery.offer(id)` since the deep-link
 * route existed; landing was the last consumer of the bridge still
 * rendering a preview-less page and still carrying a comment saying the
 * endpoint did not exist.
 *
 * Same contract as lib/impact.ts's `getPublicImpact`, for the same
 * reason: the marketing site must never 500 because the backend blinked.
 * Every failure mode — unset env var, network unreachable, non-2xx (an
 * offer that has sold out or gone out of its window 404s exactly like a
 * nonexistent one), malformed body — resolves to `{ status:
 * "unavailable" }` and the page falls back to today's generic bridge.
 */
export type OfferPreview =
  | {
      status: "ok";
      offerId: string;
      storeName: string;
      district: string;
      bagTitle: string;
      priceCents: number;
      originalValueCentsMin: number;
      originalValueCentsMax: number;
      pickupStartAt: string;
      pickupEndAt: string;
      qtyLeft: number;
    }
  | { status: "unavailable" };

/**
 * A share link is opened once, by one person, usually within the hour —
 * shorter than the impact counter's 5 minutes, because the thing it
 * describes (a bag with a closing window and a stock count) goes stale
 * fast, and long enough that a link doing the rounds in a group chat
 * still coalesces to one upstream request per minute.
 */
const REVALIDATE_SECONDS = 60;

export async function getOfferPreview(id: string): Promise<OfferPreview> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) return { status: "unavailable" };

  try {
    const client = createClient({
      baseUrl,
      transport: "cookie",
      // Landing has no authenticated surface; CONSUMER is the actor its
      // public reads notionally belong to. See lib/impact.ts.
      actor: "CONSUMER",
      getAccessToken: () => null,
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, next: { revalidate: REVALIDATE_SECONDS } }),
    });
    const offer = await client.discovery.offer(id);
    return {
      status: "ok",
      offerId: offer.offerId,
      storeName: offer.store.name,
      district: offer.store.district,
      bagTitle: offer.template.title,
      priceCents: offer.template.priceCents,
      originalValueCentsMin: offer.template.originalValueCentsMin,
      originalValueCentsMax: offer.template.originalValueCentsMax,
      pickupStartAt: offer.pickupStartAt,
      pickupEndAt: offer.pickupEndAt,
      qtyLeft: offer.qtyLeft,
    };
  } catch {
    return { status: "unavailable" };
  }
}
