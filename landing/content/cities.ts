/**
 * The four Istanbul districts task-13's brief names as the curated
 * programmatic-SEO set ("İstanbul first — Kadıköy, Beşiktaş, Şişli,
 * Beyoğlu"). Each district has real, distinct texture — sourced from
 * docs/plans/2026-08-12-kurtar-master-plan.md §5.3's go-to-market
 * sequencing (Kadıköy first: densest independent bakery/café fabric,
 * walkable, young professional demographic) — not interchangeable
 * boilerplate with a different proper noun dropped in.
 *
 * `/[sehir]` uses the district's own slug directly (kadikoy, not
 * istanbul-kadikoy) because that is how people actually search
 * ("Kadıköy sürpriz paket", never "İstanbul Kadıköy sürpriz paket").
 */

export type CitySlug = "kadikoy" | "besiktas" | "sisli" | "beyoglu";

export interface CityContent {
  slug: CitySlug;
  name: { tr: string; en: string };
  /** Province, for meta/JSON-LD address context. */
  region: "İstanbul";
  /** Named neighbourhoods within the district — grounds the copy in real places, not just the district name. */
  neighbourhoods: { tr: string[]; en: string[] };
  /** One-paragraph, district-specific character description. */
  character: { tr: string; en: string };
}

export const cities: CityContent[] = [
  {
    slug: "kadikoy",
    name: { tr: "Kadıköy", en: "Kadıköy" },
    region: "İstanbul",
    neighbourhoods: {
      tr: ["Moda", "Caferağa", "Yeldeğirmeni", "Bahariye"],
      en: ["Moda", "Caferağa", "Yeldeğirmeni", "Bahariye"],
    },
    character: {
      tr: "Kadıköy, İstanbul'un en yoğun bağımsız fırın ve kafe dokusuna sahip yakalarından biri — Moda'nın sahil şeridinden Caferağa'nın ara sokaklarına, Bahariye'nin yürüyüş aksından Yeldeğirmeni'nin genç esnaf sahnesine kadar, gün boyu ayakta kalan bir mahalle hayatı var. Genç profesyonel ve öğrenci nüfusu yoğun; akşamüstü vapur ve metro hattı boyunca yürüyerek ulaşılabilecek onlarca fırın, pastane ve kafe bulunuyor.",
      en: "Kadıköy has some of Istanbul's densest independent bakery and café fabric — from Moda's seafront to Caferağa's side streets, Bahariye's pedestrian spine to Yeldeğirmeni's young business scene, neighbourhood life here runs all day. It's dense with young professionals and students, with dozens of bakeries, pâtisseries, and cafés within easy walking distance of the ferry and metro lines.",
    },
  },
  {
    slug: "besiktas",
    name: { tr: "Beşiktaş", en: "Beşiktaş" },
    region: "İstanbul",
    neighbourhoods: {
      tr: ["Levent", "Etiler", "Ortaköy", "Bebek"],
      en: ["Levent", "Etiler", "Ortaköy", "Bebek"],
    },
    character: {
      tr: "Beşiktaş, iş merkezleriyle sahil mahallelerini aynı ilçede birleştirir — Levent ve Etiler'in ofis yoğunluğu öğle saatlerinde kafe ve restoran trafiğini artırırken, Ortaköy ve Bebek'in sahil şeridi akşamüstü daha sakin bir pastane ve kafe sahnesi sunar. Bu karışım, gün içi ve akşamüstü olmak üzere iki farklı sürpriz paket ritmi yaratır.",
      en: "Beşiktaş combines business districts with waterfront neighbourhoods in one district — Levent and Etiler's office density drives midday café and restaurant traffic, while Ortaköy and Bebek's shoreline offers a quieter, more café-and-pâtisserie-led evening scene. That mix creates two distinct surprise-bag rhythms across the same district: a daytime one and an evening one.",
    },
  },
  {
    slug: "sisli",
    name: { tr: "Şişli", en: "Şişli" },
    region: "İstanbul",
    neighbourhoods: {
      tr: ["Nişantaşı", "Teşvikiye", "Mecidiyeköy", "Bomonti"],
      en: ["Nişantaşı", "Teşvikiye", "Mecidiyeköy", "Bomonti"],
    },
    character: {
      tr: "Şişli'nin Nişantaşı ve Teşvikiye tarafı, İstanbul'un en yoğun pastane ve butik kafe kümelenmesine ev sahipliği yapar — vitrin kültürü güçlü, ürün kalitesi yüksek bir bölge. Mecidiyeköy ve Bomonti tarafında ise ofis yoğunluğu ve akşam restoran hareketliliği öne çıkar. Bu iki uç, Şişli'yi hem pastane hem restoran kategorisi için güçlü bir bölge yapar.",
      en: "Şişli's Nişantaşı and Teşvikiye side is home to some of Istanbul's densest pâtisserie and boutique-café clustering — a strong display-case culture and high product quality. Mecidiyeköy and Bomonti lean toward office density and evening restaurant traffic instead. That combination makes Şişli a strong district for both the pâtisserie and restaurant categories.",
    },
  },
  {
    slug: "beyoglu",
    name: { tr: "Beyoğlu", en: "Beyoğlu" },
    region: "İstanbul",
    neighbourhoods: {
      tr: ["İstiklal", "Cihangir", "Karaköy", "Galata"],
      en: ["İstiklal", "Cihangir", "Karaköy", "Galata"],
    },
    character: {
      tr: "Beyoğlu, İstanbul'un gece hayatı ve turizminin merkezinde yer alır — İstiklal Caddesi ve Karaköy'ün yoğun restoran ve kafe trafiği, geç saatlere kadar süren bir kapanış ritmi yaratır. Cihangir ve Galata'nın butik kafe sahnesi ise daha küçük ölçekli, karakteristik işletmelerle dolu. Turist ve yerel nüfusun bir arada olduğu bu bölge, restoran ve kafe kategorilerinde yüksek hacimli sürpriz paket potansiyeli taşır.",
      en: "Beyoğlu sits at the centre of Istanbul's nightlife and tourism — İstiklal Avenue and Karaköy's dense restaurant and café traffic run a closing rhythm that stretches later than most districts. Cihangir and Galata's boutique café scene is smaller-scale but full of character. With both tourists and locals in the mix, this district carries high-volume surprise-bag potential in the restaurant and café categories especially.",
    },
  },
];

export function getCity(slug: string): CityContent | undefined {
  return cities.find((city) => city.slug === slug);
}
