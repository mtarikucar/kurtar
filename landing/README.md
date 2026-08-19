# kurtar landing (Task 13)

Marketing/SEO site — Next.js App Router, static by default. See `docs/frontend-contract.md` (repo root) for the workspace-wide contract this app is built on.

## Running locally

```
npm run dev -w landing      # http://localhost:3000
npm run build -w landing
npm run start -w landing
npm run lint -w landing
npm run typecheck -w landing
npm run test -w landing     # vitest run
```

Copy `.env.example` to `.env.local` and adjust if your backend/site origin differs from the defaults.

## i18n: two content mechanisms, on purpose

This app ships two locales (`tr` default, `en`) via `next-intl`, but user-facing copy lives in two different places depending on its shape:

- **`messages/{tr,en}.json`** — next-intl message catalogs, read via `useTranslations`/`getTranslations`. This is every page's static UI copy: nav, footer, hero/section text, FAQ items, step lists. `test/i18n-parity.test.ts` enforces that both files declare exactly the same set of keys.
- **`content/*.ts`** — hand-authored, locale-keyed TypeScript data modules (`{ tr: "...", en: "..." }` shapes throughout) for content that's fundamentally *data*, not page-static copy: `content/cities.ts` and `content/categories.ts` (the programmatic `/[sehir]/[kategori]` pages' inputs), `content/blog/posts.ts`, `content/legal/*.ts`. A JSON message catalog is a poor fit for 20 programmatic page combinations or long-form legal documents; a typed data module with both locales inline keeps everything colocated and lets `content/programmatic.ts` combine city + category facts into genuinely distinct per-page copy. `test/content-integrity.test.ts` covers structural parity here (matching block counts across locales, non-empty fields, etc.) the way the i18n-parity test covers `messages/`.

Both mechanisms are equally "not hardcoded" — every string a user sees is locale-aware one way or the other.

## Legal texts are drafts

Every document under `content/legal/` is a working draft written to be grounded in the platform's real backend mechanics (see each file's own top-of-file comment for the specific commercial figures/deadlines and their source), but **none has been reviewed by a lawyer**. See `content/legal/README.md` for the full notice and the open items that block publishing these as binding text. That warning is deliberately *not* rendered anywhere on the live site (task-13 brief) — only a neutral `v0.1 — <date>` stamp shows on each legal page itself.

## `/o/[id]` — the share-link bridge

The universal-link bridge page (`app/[locale]/o/[id]/page.tsx`) reads the offer it is about through the backend's public single-offer lookup (`GET /discovery/offers/{id}` — `DiscoveryController`, exposed as `client.discovery.offer(id)`) and renders the shop, the bag, the value band, the price and the pickup window, in the site's own receipt, plus an og card carrying the same. `lib/offer.ts` degrades every failure — unset `NEXT_PUBLIC_API_BASE_URL`, backend down, or the 404 a sold-out/closed offer returns — to the generic "open the app" bridge, never an error page.

Still deliberate: `app/robots.ts` disallows `/o/`. These pages are for a person who was sent a link, not organic search results (the same reasoning excludes them from `sitemap.ts`), and the chat apps that unfurl the og card do not consult robots.txt.

## Design system

One shared visual system lives in `app/globals.css` (CSS custom properties derived from `@kurtar/ui-tokens`' color/spacing/type values, plus the site's reusable component classes — `kt-receipt`, `kt-faq`, `kt-nav`, etc.). The signature device is the "fiş" (receipt) component (`components/Receipt.tsx`): every worked money example on the site (hero, `/isletme`'s fee breakdown, `/nasil-calisir`'s price example, programmatic category pages' price anchor) renders through it, so a reader learns to read kurtar's numbers the same way everywhere.
