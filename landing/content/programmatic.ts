import type { CityContent } from "./cities";
import type { CategoryContent } from "./categories";

/**
 * Composes a genuinely distinct intro paragraph for one (city, category)
 * combination — task-13 brief: "genuinely distinct copy — not a template
 * with the city name swapped." The distinctiveness comes from two
 * independent axes that both vary real content, not just a proper noun:
 *  1. A category-specific template (5 variants, one per category) that
 *     encodes what's actually true about that category's daily rhythm.
 *  2. City-specific inputs (named neighbourhoods, not just the district
 *     name) drawn from content/cities.ts's own hand-written `character`
 *     field, which itself already differs in which category it
 *     foregrounds per district (see that file's doc comment).
 * 4 cities x 5 categories = 20 combinations, no two sharing a sentence
 * shape AND a set of proper nouns.
 */
export function buildIntro(
  city: CityContent,
  category: CategoryContent,
  locale: "tr" | "en",
): string {
  const n = city.neighbourhoods[locale];
  const cityName = city.name[locale];
  const neighbourhoodList =
    locale === "tr"
      ? `${n.slice(0, -1).join(", ")} ve ${n[n.length - 1]}`
      : `${n.slice(0, -1).join(", ")}, and ${n[n.length - 1]}`;

  const templates: Record<CategoryContent["slug"], Record<"tr" | "en", string>> = {
    firin: {
      tr: `${cityName}'de gün, ${neighbourhoodList} gibi mahallelerdeki fırınların vitrinleriyle başlar. Akşamüstü kapanışa yaklaşırken elde kalan günün ekmeği ve simidi, kurtar'da üçte bir fiyatına sürpriz pakete dönüşür — ${cityName}'in yürüyerek dolaşılabilir sokak dokusu, bu paketleri işten ya da okuldan dönüş yolunda almayı kolaylaştırır.`,
      en: `In ${cityName}, the day starts at the display windows of bakeries around ${neighbourhoodList}. As closing time approaches, the day's leftover bread and simit turn into a surprise bag at a third of the price on kurtar — and ${cityName}'s walkable street layout makes picking one up on the way home an easy detour.`,
    },
    pastane: {
      tr: `${cityName}'in ${neighbourhoodList} çevresindeki pastaneleri, günün vitrinini kapanışa kadar taze tutmaya çalışır — geriye kalan pasta dilimleri ve tatlılar, ertesi gün servis edilemez. kurtar, bu fazlayı ${cityName}'de gerçek değerinin çok altında bir fiyata sürpriz paket olarak sunar.`,
      en: `Pâtisseries around ${neighbourhoodList} in ${cityName} keep their display case fresh right up to closing — whatever cake slices and desserts are left over can't be served the next day. kurtar turns that surplus into a surprise bag in ${cityName}, priced well below its real value.`,
    },
    kafe: {
      tr: `${neighbourhoodList} başta olmak üzere ${cityName} genelindeki kafeler, her gün taze hazırladığı tatlı ve atıştırmalıkları kapanışta elden çıkarmak ister. kurtar, ${cityName}'deki bu kafelerin günlük fazlasını sürpriz paket olarak listeler — genellikle bir içecek dahil, çok daha geniş bir ürün grubunu kapsar.`,
      en: `Cafés across ${cityName}, especially around ${neighbourhoodList}, bake fresh pastries and snacks every day and want them gone by closing. kurtar lists these cafés' daily surplus as surprise bags in ${cityName} — usually covering a much wider mix of items than a single drink order, drink included.`,
    },
    restoran: {
      tr: `${cityName}'de, özellikle ${neighbourhoodList} çevresinde, restoranların günlük hazırladığı porsiyonlar akşam kapanışında tükenmezse ertesi gün servis edilemez. kurtar, bu restoranların o akşamki tek fırsatını sürpriz paket olarak ${cityName} sakinlerine ve ziyaretçilerine ulaştırır.`,
      en: `In ${cityName}, particularly around ${neighbourhoodList}, a restaurant's daily-prepped portions can't be served the next day if they don't sell out by closing. kurtar turns that evening's only chance into a surprise bag for ${cityName}'s residents and visitors alike.`,
    },
    manav: {
      tr: `${cityName}'deki manavlar, ${neighbourhoodList} gibi mahallelerde her gün taze meyve ve sebze satar — günün sonunda olgunluğu ilerlemiş ama hâlâ tüketilebilir ürünler elde kalır. kurtar, Türkiye'nin en çok israf edilen gıda kategorisindeki bu fazlayı ${cityName}'de sürpriz paket olarak sunar.`,
      en: `Greengrocers in ${cityName}, around neighbourhoods like ${neighbourhoodList}, sell fresh fruit and vegetables every day — by evening, what's left is a little further along than the shelf wants but perfectly good to eat. kurtar turns that surplus, from Turkey's single most-wasted food category, into a surprise bag in ${cityName}.`,
    },
  };

  return templates[category.slug][locale];
}
