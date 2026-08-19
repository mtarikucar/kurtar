import {
  KESIF_SAG_KENAR,
  KESIF_SOL_KENAR,
  SPINE_BOSLUK,
  SPINE_ETIKET_TABANI,
  SPINE_ETIKET_TAVANI,
  SPINE_HAIRLINE_GENISLIGI,
  SPINE_KENAR_TOPLAMI,
  kartGenisligiHesapla,
  spineEtiketGenisligi,
  spineToplamGenisligi,
} from "../components/kesif/duzen";

/** "10,3 km" — the widest distance the seeded data prints (Levent Fırın,
 * 10.290 m). Chivo Mono `data` is a 0.6em advance with +0.4 tracking, so
 * 7 characters cost 7 × (12 × 0.6 + 0.4) = 53.2pt at 1×. */
const EN_GENIS_MESAFE = (boyut: number) => 7 * (boyut * 0.6 + 0.4);

describe("kartGenisligiHesapla — the spine-bearing card's width (review fix #2)", () => {
  it("the spine column is exactly label + gap + hairline + gap", () => {
    expect(spineToplamGenisligi(390, 1)).toBe(
      spineEtiketGenisligi(390, 1) + SPINE_BOSLUK + SPINE_HAIRLINE_GENISLIGI + SPINE_BOSLUK,
    );
    expect(SPINE_KENAR_TOPLAMI).toBe(
      SPINE_BOSLUK + SPINE_HAIRLINE_GENISLIGI + SPINE_BOSLUK,
    );
  });

  it("is the reviewed 54pt at the default text size — the label is not a lever for width", () => {
    expect(spineEtiketGenisligi(390, 1)).toBe(SPINE_ETIKET_TABANI);
    expect(SPINE_ETIKET_TABANI).toBe(54);
  });

  it("at 390pt, the card is wider than the reviewed 291pt that clipped real content", () => {
    const genislik = kartGenisligiHesapla(390, 1);
    // The reviewed defect clipped `280–380₺ değerinde` and the meta rail's
    // `18:30–21:00 · 1,3 km · 16 dk` at 291pt (see build log for the
    // glyph-advance arithmetic — ~301pt of content plus VitrinKarti's own
    // fixed 12pt-per-side padding, which this track cannot change).
    expect(genislik).toBeGreaterThan(291);
    expect(genislik).toBe(390 - KESIF_SOL_KENAR - spineToplamGenisligi(390, 1) - KESIF_SAG_KENAR);
  });

  it("the right gutter still matches the screen's own s4, so the list lines up with the header and chips", () => {
    expect(KESIF_SAG_KENAR).toBe(16);
  });

  it("never crushes the card below its 280pt floor on a narrow device", () => {
    expect(kartGenisligiHesapla(320, 1)).toBeGreaterThanOrEqual(280);
    expect(kartGenisligiHesapla(320, 1.3)).toBeGreaterThanOrEqual(280);
    expect(kartGenisligiHesapla(360, 1.3)).toBeGreaterThanOrEqual(280);
  });
});

/**
 * Finding #20. The label is `yazi.data` with `allowFontScaling` on and a
 * 1.3 ceiling, so at the largest text step it is DRAWN at 15.6pt — and a
 * 54pt column turns "10,3 km" into "10,3 k…". The spine has exactly one
 * job; that number is it.
 */
describe("the distance label survives the user's text size (finding #20)", () => {
  it("holds '10,3 km' at 1× — the measurement the 54pt column was made for", () => {
    expect(EN_GENIS_MESAFE(12)).toBeLessThanOrEqual(spineEtiketGenisligi(390, 1));
  });

  it("holds '10,3 km' at the label's own 1.3 ceiling, on the spec's 390pt phone", () => {
    expect(EN_GENIS_MESAFE(12 * SPINE_ETIKET_TAVANI)).toBeLessThanOrEqual(
      spineEtiketGenisligi(390, 1.3),
    );
  });

  it("does not grow past the label's own ceiling, however large the system setting", () => {
    expect(spineEtiketGenisligi(390, 3)).toBe(spineEtiketGenisligi(390, SPINE_ETIKET_TAVANI));
  });

  it("gives the card back exactly what the spine takes — the row never exceeds the screen", () => {
    for (const ekran of [320, 360, 390, 430]) {
      for (const olcek of [1, 1.15, 1.3, 2]) {
        const toplam =
          KESIF_SOL_KENAR +
          spineToplamGenisligi(ekran, olcek) +
          kartGenisligiHesapla(ekran, olcek) +
          KESIF_SAG_KENAR;
        // 320pt is narrower than the 280pt card floor plus its chrome can
        // fit; every phone the app actually targets stays inside itself.
        if (ekran >= 360) expect(toplam).toBeLessThanOrEqual(ekran);
      }
    }
  });

  it("never spends the card's own floor on the label — on a 360pt phone the card wins", () => {
    // The card's meta rail prints the same distance a second time, so a
    // short spine label costs a duplicate; a short card costs the pickup
    // window. Where both cannot fit, the card is what is protected.
    expect(kartGenisligiHesapla(360, 1.3)).toBe(280);
    expect(spineEtiketGenisligi(360, 1.3)).toBeGreaterThanOrEqual(SPINE_ETIKET_TABANI);
  });
});
