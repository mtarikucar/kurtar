import {
  KESIF_SAG_KENAR,
  KESIF_SOL_KENAR,
  SPINE_BOSLUK,
  SPINE_ETIKET_GENISLIGI,
  SPINE_HAIRLINE_GENISLIGI,
  SPINE_TOPLAM_GENISLIK,
  kartGenisligiHesapla,
} from "../components/kesif/duzen";

describe("kartGenisligiHesapla — the spine-bearing card's width (review fix #2)", () => {
  it("SPINE_TOPLAM_GENISLIK is exactly label + gap + hairline + gap", () => {
    expect(SPINE_TOPLAM_GENISLIK).toBe(
      SPINE_ETIKET_GENISLIGI + SPINE_BOSLUK + SPINE_HAIRLINE_GENISLIGI + SPINE_BOSLUK,
    );
  });

  it("the label is untouched at 54pt — it is already sized to the widest real distance, not a lever for width", () => {
    expect(SPINE_ETIKET_GENISLIGI).toBe(54);
  });

  it("at 390pt, the card is wider than the reviewed 291pt that clipped real content", () => {
    const genislik = kartGenisligiHesapla(390);
    // The reviewed defect clipped `280–380₺ değerinde` and the meta rail's
    // `18:30–21:00 · 1,3 km · 16 dk` at 291pt (see build log for the
    // glyph-advance arithmetic — ~301pt of content plus VitrinKarti's own
    // fixed 12pt-per-side padding, which this track cannot change).
    expect(genislik).toBeGreaterThan(291);
    expect(genislik).toBe(390 - KESIF_SOL_KENAR - SPINE_TOPLAM_GENISLIK - KESIF_SAG_KENAR);
  });

  it("the right gutter still matches the screen's own s4, so the list lines up with the header and chips", () => {
    expect(KESIF_SAG_KENAR).toBe(16);
  });

  it("never crushes the card below its 280pt floor on a narrow device", () => {
    expect(kartGenisligiHesapla(320)).toBeGreaterThanOrEqual(280);
  });
});
