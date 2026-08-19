import type { Palet } from "./tokens";

/**
 * Hangi yüzeyin üstüne yazıyoruz — the one question a call site has to
 * answer before it picks an ink (spec §1.1).
 *
 * Three surfaces, not two, because the twilight palette puts the card and
 * the two grounds on opposite sides of mid-lightness:
 *
 *  - `kart`  — a painted object: `yuzeyKaldirim` / `yuzeyYukselti`, and
 *    anything drawn inside one (a `<Blok/>`, an order row, the ticket, an
 *    input field, the offer card's pavement block).
 *  - `sokak` — the street ground `bgAsfalt`, which `Screen`/`PanelScreen`
 *    paint under every route. Any text that is NOT inside a painted
 *    object is on the street, including text on a screen that also has
 *    cards on it.
 *  - `cukur` — the recess `bgDerin`: map water, the price pin, the web
 *    map pane, and the redeem / confirmation interiors.
 *
 * Most call sites read `palet.yaziAnaZemin` (etc.) directly, because most
 * of them know exactly which surface they are on. This helper exists for
 * the handful of shared primitives — `Dugme`, `IkonDugmesi`, `PanelButton`,
 * `PanelPill` — that are genuinely mounted on more than one, and it keeps
 * that decision a named argument at the call site rather than a colour
 * copied around.
 */
export type YaziZemini = "kart" | "sokak" | "cukur";

/** Primary type for a surface. */
export function anaYazi(palet: Palet, zemin: YaziZemini): string {
  return zemin === "sokak"
    ? palet.yaziAnaZemin
    : zemin === "cukur"
      ? palet.yaziAnaCukur
      : palet.yaziAna;
}

/** Secondary type for a surface. */
export function sisYazi(palet: Palet, zemin: YaziZemini): string {
  return zemin === "sokak"
    ? palet.yaziSisZemin
    : zemin === "cukur"
      ? palet.yaziSisCukur
      : palet.yaziSis;
}

/** Sodium as type for a surface — money, and only money. */
export function sodyumYazisi(palet: Palet, zemin: YaziZemini): string {
  return zemin === "sokak"
    ? palet.sodyumYaziZemin
    : zemin === "cukur"
      ? palet.sodyumYaziCukur
      : palet.sodyumYazi;
}
