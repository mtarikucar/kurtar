/**
 * The five business categories the programmatic şehir/kategori pages (and
 * the home page's category grid) cover — task-13 brief's curated list.
 * Price anchors below are the platform's own published starting prices
 * per category (docs/plans/2026-08-12-kurtar-master-plan.md §5.1, itself
 * anchored to real Aug-2026 Istanbul price references: simit ₺25/İSTESOB,
 * bread ₺17.50, a pastry slice ~₺140-170, a chain latte ~₺150-165) — not
 * invented numbers, and not the same figure copy-pasted across categories.
 *
 * This is intentionally a hand-authored TS module rather than next-intl
 * `messages/*.json`: it is locale-keyed DATA (consumed by both the home
 * page and every one of the 20 programmatic city/category pages, and
 * combined with content/cities.ts by content/programmatic.ts), not a
 * page's static UI copy — see landing/README.md's i18n section for the
 * split rationale.
 */

export type CategorySlug = "firin" | "pastane" | "kafe" | "restoran" | "manav";

export interface CategoryContent {
  slug: CategorySlug;
  name: { tr: string; en: string };
  /** Lowercase form for mid-sentence use ("X sürpriz paketleri"). */
  nameLower: { tr: string; en: string };
  /** Typical starting price for a surprise bag in this category, in kuruş. */
  startingPriceCents: number;
  /** Typical real-value range of a bag's contents, in kuruş — [min, max]. */
  valueRangeCents: [number, number];
  /** One-sentence, category-specific hook — never reused verbatim across categories. */
  hook: { tr: string; en: string };
  /** What's typically in a bag from this category. */
  typicalContents: { tr: string; en: string };
  /** A grounded, category-specific fact (TÜİK waste share, price anchor, or market context). */
  fact: { tr: string; en: string };
}

export const categories: CategoryContent[] = [
  {
    slug: "firin",
    name: { tr: "Fırın", en: "Bakery" },
    nameLower: { tr: "fırın", en: "bakery" },
    startingPriceCents: 6900,
    valueRangeCents: [18000, 30000],
    hook: {
      tr: "Ekmek ve simit her gün üretilir, her gün de günü geçmişse elde kalır — fırınların fazlası en öngörülebilir olanıdır.",
      en: "Bread and simit are baked fresh every day, and whatever's left at closing is left for good — a bakery's surplus is the most predictable kind there is.",
    },
    typicalContents: {
      tr: "Günün ekmeği, simit, poğaça ve o gün üretilen diğer fırın ürünleri.",
      en: "The day's bread, simit, poğaça, and whatever else came out of the oven that day.",
    },
    fact: {
      tr: "TÜİK'in 2025 israf verisine göre ekmek, Türkiye'deki hanehalkı gıda israfının %32,5'ini oluşturuyor — tek bir ürün kategorisi için en yüksek paylardan biri.",
      en: "Per TÜİK's 2025 waste figures, bread alone accounts for 32.5% of Turkish household food waste — one of the single highest shares of any product category.",
    },
  },
  {
    slug: "pastane",
    name: { tr: "Pastane", en: "Pâtisserie" },
    nameLower: { tr: "pastane", en: "pâtisserie" },
    startingPriceCents: 14900,
    valueRangeCents: [40000, 65000],
    hook: {
      tr: "Bir pastanenin günlük vitrini, kapanışta ya satılır ya da ertesi gün tazeliğini kaybeder — sürpriz paket üçüncü bir seçenek sunar.",
      en: "A pâtisserie's daily display case either sells out by closing or loses its freshness by morning — a surprise bag is the third option.",
    },
    typicalContents: {
      tr: "Pasta dilimleri, tatlılar ve günün vitrininden kalan diğer ürünler.",
      en: "Cake slices, desserts, and whatever else is left in the day's display case.",
    },
    fact: {
      tr: "Bir pasta diliminin standart fiyatı 140-170 ₺ bandındayken, kurtar'daki bir pastane sürpriz paketi bu değerin çok altında bir fiyattan başlar.",
      en: "A single cake slice typically runs ₺140-170; a kurtar pâtisserie surprise bag starts well below that per-item price for a whole bag.",
    },
  },
  {
    slug: "kafe",
    name: { tr: "Kafe", en: "Café" },
    nameLower: { tr: "kafe", en: "café" },
    startingPriceCents: 11900,
    valueRangeCents: [30000, 45000],
    hook: {
      tr: "Kafeler her gün taze pişirdiği tatlı ve atıştırmalıkları kapanışta elden çıkarmak ister — sürpriz paket bunu bir tık haline getirir.",
      en: "Cafés bake fresh pastries and snacks daily and want them gone by closing — a surprise bag makes that a single tap.",
    },
    typicalContents: {
      tr: "Pasta, kurabiye, sandviç veya o gün hazırlanan diğer kafe ürünleri.",
      en: "Pastries, cookies, sandwiches, or whatever else the café prepared that day.",
    },
    fact: {
      tr: "Zincir bir kafede tek bir latte 150-165 ₺ bandındayken, kafe sürpriz paketleri genellikle içecek dahil çok daha geniş bir ürün grubunu kapsar.",
      en: "A single latte at a chain café runs ₺150-165; a café surprise bag typically covers a much wider mix of items, drinks included, for less.",
    },
  },
  {
    slug: "restoran",
    name: { tr: "Restoran", en: "Restaurant" },
    nameLower: { tr: "restoran", en: "restaurant" },
    startingPriceCents: 16900,
    valueRangeCents: [45000, 70000],
    hook: {
      tr: "Bir restoranın günlük hazırladığı porsiyonlar akşam kapanışında tükenmezse, ertesi gün servis edilemez — sürpriz paket o akşamki tek şansıdır.",
      en: "A restaurant's daily-prepped portions can't be served the next day if they don't sell out by closing — a surprise bag is that evening's only chance.",
    },
    typicalContents: {
      tr: "Günün menüsünden hazır porsiyonlar veya o gün için hazırlanmış yemekler.",
      en: "Ready portions from the day's menu, or dishes specifically prepared for that day.",
    },
    fact: {
      tr: "Restoran kategorisi kurtar'ın kategoriler arasındaki en yüksek değer bandına sahiptir — bir porsiyonun gerçek menü fiyatı genellikle 450-700 ₺ arasındadır.",
      en: "The restaurant category carries kurtar's highest value band — a portion's real menu price typically runs ₺450-700.",
    },
  },
  {
    slug: "manav",
    name: { tr: "Manav", en: "Greengrocer" },
    nameLower: { tr: "manav", en: "greengrocer" },
    startingPriceCents: 9900,
    valueRangeCents: [25000, 40000],
    hook: {
      tr: "Meyve ve sebze, Türkiye'nin en çok israf edilen gıda kategorisidir — bir manavın günlük fazlası tam olarak bu sorunun ortasındadır.",
      en: "Fruit and vegetables are Turkey's single most-wasted food category — a greengrocer's daily surplus sits right at the centre of that problem.",
    },
    typicalContents: {
      tr: "Günün taze meyve ve sebzelerinden oluşan, olgunluğu ilerlemiş ama hâlâ tüketilebilir bir seçki.",
      en: "A selection of the day's fresh fruit and vegetables — a little further along than the display shelf wants, still perfectly good to eat.",
    },
    fact: {
      tr: "TÜİK'in 2025 verisine göre meyve-sebze, Türkiye'deki hanehalkı gıda israfının %39,7'sini oluşturuyor — tüm kategoriler arasında en yüksek pay.",
      en: "Per TÜİK's 2025 figures, fresh produce accounts for 39.7% of Turkish household food waste — the single highest share of any category.",
    },
  },
];

export function getCategory(slug: string): CategoryContent | undefined {
  return categories.find((category) => category.slug === slug);
}
