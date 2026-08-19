import {
  ayGenisligi,
  ayGenisligiDevamli,
  aylaraGrupla,
  catPayi,
  dukkanCatiYuksekligi,
  dukkanKatSayisi,
  dukkanParlakligi,
  dukkanPencereRengi,
  dukkanYuksekligi,
  dukkanZiyaretSayilari,
  enCokGidilenDukkan,
  enSikSaat,
  isikHavuzuYolu,
  korniyYolu,
  partiDuvariYolu,
  sokakCatiTavani,
  sokakYuksekligi,
  tenteSeritYolu,
  tenteYolu,
  terasYolu,
  ustPencereler,
  CATI_OYNAMA_TAVANI,
  CEPHE_PAY,
  KALDIRIM_KALINLIK,
  KALDIRIM_YUKSEKLIK,
  KAPALI_DUKKAN_YUKSEKLIGI,
  KAPI_GENISLIK,
  KAPI_X,
  KAPI_YUKSEKLIK,
  PENCERE_ESIK,
  PENCERE_GENISLIK,
  PENCERE_X,
  PENCERE_YUKSEKLIK,
  SOKAK_DEVAM_DUKKAN_SAYISI,
  SOKAK_EN_YUKSEK_CATI,
  SOKAK_SVG_YUKSEKLIGI,
  DUKKAN_GENISLIK,
  DUKKAN_ARALIK,
  DUKKAN_TABAN_PARLAKLIK,
  DUKKAN_TABAN_YUKSEKLIK,
  DUKKAN_TEKRAR_TAVANI,
  UST_PENCERE_GENISLIK,
  UST_PENCERE_YUKSEKLIK,
  VITRIN_YUKSEKLIK,
  ZEMIN_KAT_YUKSEKLIK,
  type KurtarmaKaydi,
} from "../components/sokak/sokak-hesap";

function kayit(
  reservationId: string,
  storeId: string,
  iso: string,
): KurtarmaKaydi {
  return { reservationId, storeId, redeemedAt: new Date(iso) };
}

describe("aylaraGrupla — the street's month grouping", () => {
  it("groups by Istanbul calendar month and sorts oldest month first", () => {
    const gruplar = aylaraGrupla([
      kayit("r3", "s1", "2026-08-05T18:00:00.000Z"),
      kayit("r1", "s1", "2026-06-05T18:00:00.000Z"),
      kayit("r2", "s2", "2026-07-05T18:00:00.000Z"),
    ]);

    expect(gruplar.map((g) => g.anahtar)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(gruplar[0]!.etiket).toBe("Haziran 2026");
    expect(gruplar[2]!.etiket).toBe("Ağustos 2026");
  });

  it("keeps rescues within a month in chronological order", () => {
    const gruplar = aylaraGrupla([
      kayit("later", "s1", "2026-08-20T18:00:00.000Z"),
      kayit("earlier", "s1", "2026-08-01T18:00:00.000Z"),
    ]);

    expect(gruplar).toHaveLength(1);
    expect(gruplar[0]!.kayitlar.map((k) => k.reservationId)).toEqual([
      "earlier",
      "later",
    ]);
  });

  it("is empty for an empty history", () => {
    expect(aylaraGrupla([])).toEqual([]);
  });

  it("resolves a late-night Istanbul instant to the correct UTC-crossing month", () => {
    // 23:30 Istanbul on 2026-08-31 is still 2026-08-31 20:30 UTC — no
    // rollover risk here, but 01:30 Istanbul on 2026-09-01 IS
    // 2026-08-31T22:30:00Z in UTC, which a naive getUTCMonth() read would
    // misfile into August.
    const gruplar = aylaraGrupla([kayit("r1", "s1", "2026-08-31T22:30:00.000Z")]);
    expect(gruplar[0]!.anahtar).toBe("2026-09");
  });
});

describe("dukkanZiyaretSayilari — total visits per shop, whole history", () => {
  it("counts across months, not resetting per month", () => {
    const sayaclar = dukkanZiyaretSayilari([
      kayit("r1", "moda-firin", "2026-06-01T18:00:00.000Z"),
      kayit("r2", "moda-firin", "2026-07-01T18:00:00.000Z"),
      kayit("r3", "yeldegirmeni", "2026-07-01T18:00:00.000Z"),
    ]);
    expect(sayaclar.get("moda-firin")).toBe(2);
    expect(sayaclar.get("yeldegirmeni")).toBe(1);
  });
});

describe("dukkanYuksekligi / dukkanParlakligi — taller and brighter, bounded", () => {
  it("is at its floor for a single visit", () => {
    expect(dukkanYuksekligi(1)).toBe(DUKKAN_TABAN_YUKSEKLIK);
    expect(dukkanParlakligi(1)).toBeCloseTo(DUKKAN_TABAN_PARLAKLIK, 5);
  });

  // The single most-seen frame on this screen is ONE rescue: it is what
  // every user has after their first bag and what most users will have
  // for weeks. At the old 0.3 floor it resolved to a muddy brown — the
  // frame that has to say "this one is yours" said "unfinished". The
  // floor is a design decision and it is pinned here, not left to drift
  // back down the next time someone widens the repeat-visit range.
  it("already GLOWS at a single visit — the floor is lit, not the dimmest the scale can reach", () => {
    expect(dukkanParlakligi(1)).toBeGreaterThanOrEqual(0.5);
    // …and still leaves the regular somewhere brighter to go.
    expect(dukkanParlakligi(1)).toBeLessThan(dukkanParlakligi(DUKKAN_TEKRAR_TAVANI));
  });

  it("grows monotonically with repeat visits", () => {
    const yukseklikler = [1, 2, 3, 4, 5, 10].map(dukkanYuksekligi);
    for (let i = 1; i < yukseklikler.length; i += 1) {
      expect(yukseklikler[i]!).toBeGreaterThanOrEqual(yukseklikler[i - 1]!);
    }
    const parlakliklar = [1, 2, 3, 4, 5, 10].map(dukkanParlakligi);
    for (let i = 1; i < parlakliklar.length; i += 1) {
      expect(parlakliklar[i]!).toBeGreaterThanOrEqual(parlakliklar[i - 1]!);
    }
  });

  it("flattens at the subitizing cap — a regular doesn't swallow the street", () => {
    const tavanda = dukkanYuksekligi(DUKKAN_TEKRAR_TAVANI);
    const cokFazla = dukkanYuksekligi(50);
    expect(cokFazla).toBe(tavanda);
    expect(dukkanParlakligi(50)).toBeCloseTo(1, 5);
  });

  it("never exceeds the ceiling the street is proved to stay under", () => {
    // The tallest building the drawing can ever produce is a shop at or
    // past the repeat cap that also drew the highest roofline.
    const enUzun = dukkanYuksekligi(50) + CATI_OYNAMA_TAVANI;
    expect(enUzun).toBe(SOKAK_EN_YUKSEK_CATI);
    expect(SOKAK_SVG_YUKSEKLIGI).toBe(SOKAK_EN_YUKSEK_CATI + KALDIRIM_YUKSEKLIK);
  });

  it("grows one storey of lit flats per repeat visit, capped with the height", () => {
    expect(dukkanKatSayisi(1)).toBe(0);
    expect(dukkanKatSayisi(2)).toBe(1);
    expect(dukkanKatSayisi(DUKKAN_TEKRAR_TAVANI)).toBe(DUKKAN_TEKRAR_TAVANI - 1);
    expect(dukkanKatSayisi(50)).toBe(dukkanKatSayisi(DUKKAN_TEKRAR_TAVANI));
  });
});

describe("catPayi — the roofline jitter that stops one stamp repeating", () => {
  it("is stable for a shop id and bounded to less than one repeat storey", () => {
    for (const id of ["moda-firin", "yeldegirmeni", "caferaga", "x", ""]) {
      const pay = catPayi(id);
      expect(pay).toBe(catPayi(id));
      expect(pay).toBeGreaterThanOrEqual(0);
      expect(pay).toBeLessThanOrEqual(CATI_OYNAMA_TAVANI);
    }
  });

  it("never lets a roofline outrank the visit count it decorates", () => {
    // A one-time visit with the highest possible roofline must still be
    // shorter than a two-time visit with the lowest — otherwise "taller
    // = you go there more" stops being true.
    const enYuksekBir = dukkanYuksekligi(1) + CATI_OYNAMA_TAVANI;
    expect(enYuksekBir).toBeLessThan(dukkanYuksekligi(2));
  });

  it("varies across a real spread of shop ids rather than collapsing to one value", () => {
    const paylar = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h", "moda-firin", "kadikoy"].map(catPayi),
    );
    expect(paylar.size).toBeGreaterThan(1);
  });
});

describe("sokakCatiTavani — the street reserves only the height it actually uses", () => {
  const ziyaret = (girisler: readonly (readonly [string, number])[]) => new Map(girisler);

  it("is the closed frontage's own height for a street with no rescues", () => {
    expect(sokakCatiTavani([], new Map())).toBe(KAPALI_DUKKAN_YUKSEKLIGI);
  });

  it("is the tallest single building, not the theoretical maximum", () => {
    const kayitlar = [kayit("r1", "s1", "2026-08-01T18:00:00.000Z")];
    const tavan = sokakCatiTavani(kayitlar, ziyaret([["s1", 1]]));
    expect(tavan).toBe(dukkanCatiYuksekligi("s1", 1));
    // The whole point: a one-rescue street does NOT reserve room for a
    // four-times regular's building.
    expect(tavan).toBeLessThan(SOKAK_EN_YUKSEK_CATI);
  });

  it("rises to the regular's building once there is one", () => {
    const kayitlar = [
      kayit("r1", "bir-kez", "2026-08-01T18:00:00.000Z"),
      kayit("r2", "muduavim", "2026-08-02T18:00:00.000Z"),
      kayit("r3", "muduavim", "2026-08-03T18:00:00.000Z"),
      kayit("r4", "muduavim", "2026-08-04T18:00:00.000Z"),
      kayit("r5", "muduavim", "2026-08-05T18:00:00.000Z"),
    ];
    const sayaclar = dukkanZiyaretSayilari(kayitlar);
    expect(sokakCatiTavani(kayitlar, sayaclar)).toBe(
      dukkanCatiYuksekligi("muduavim", 4),
    );
  });

  it("adds the pavement under whatever roofline it settled on", () => {
    expect(sokakYuksekligi(KAPALI_DUKKAN_YUKSEKLIGI)).toBe(
      KAPALI_DUKKAN_YUKSEKLIGI + KALDIRIM_YUKSEKLIK,
    );
  });
});

describe("ayGenisligi — one <Svg> per month, one adjoining terrace inside it", () => {
  it("is zero for an empty month", () => {
    expect(ayGenisligi(0)).toBe(0);
  });

  it("sums storefront widths with NO gap between them — shops on a street adjoin", () => {
    expect(DUKKAN_ARALIK).toBe(0);
    expect(ayGenisligi(1)).toBe(DUKKAN_GENISLIK);
    expect(ayGenisligi(3)).toBe(DUKKAN_GENISLIK * 3);
  });
});

describe("ayGenisligiDevamli — the street's growing edge past the most recent rescue", () => {
  it("adds the fixed continuation width on top of the real storefronts", () => {
    expect(ayGenisligiDevamli(0)).toBe(ayGenisligi(SOKAK_DEVAM_DUKKAN_SAYISI));
    expect(ayGenisligiDevamli(1)).toBe(ayGenisligi(1 + SOKAK_DEVAM_DUKKAN_SAYISI));
    expect(ayGenisligiDevamli(3)).toBe(ayGenisligi(3 + SOKAK_DEVAM_DUKKAN_SAYISI));
  });

  it("is always wider than the same month without its continuation", () => {
    for (const adet of [1, 2, 3, 17]) {
      expect(ayGenisligiDevamli(adet)).toBeGreaterThan(ayGenisligi(adet));
    }
  });

  it("accepts an explicit continuation count, defaulting to the fixed one", () => {
    expect(ayGenisligiDevamli(1, 0)).toBe(ayGenisligi(1));
    expect(ayGenisligiDevamli(1, 5)).toBe(ayGenisligi(6));
  });
});

describe("KAPALI_DUKKAN_YUKSEKLIGI — the closed-frontage placeholder", () => {
  it("is shorter than a real single visit's own floor height", () => {
    // A placeholder must never be mistaken for a genuine (if modest)
    // rescue at a glance — see SeninSokagin.tsx's KapaliDukkan.
    expect(KAPALI_DUKKAN_YUKSEKLIGI).toBeLessThan(DUKKAN_TABAN_YUKSEKLIK);
  });

  it("is still tall enough to carry a shutter and its lintel", () => {
    // It is a shut SHOP, not a stub: the corrugated opening and the box
    // the kepenk rolls out of both have to fit inside it (spec §2's
    // "5pt lintel: reads as the shutter box").
    expect(KAPALI_DUKKAN_YUKSEKLIGI).toBeGreaterThan(VITRIN_YUKSEKLIK);
  });
});

describe("enSikSaat — the average clock time across every rescue", () => {
  it("is null for an empty history", () => {
    expect(enSikSaat([])).toBeNull();
  });

  it("is exactly that rescue's own time for a single rescue", () => {
    // 21:20 Istanbul (UTC+3 in August) = 18:20Z.
    const saat = enSikSaat([kayit("r1", "s1", "2026-08-10T18:20:00.000Z")]);
    expect(saat).toBe("21:20");
  });

  it("averages minutes-since-midnight across several rescues", () => {
    // 19:00 and 19:40 Istanbul -> mean 19:20.
    const saat = enSikSaat([
      kayit("r1", "s1", "2026-08-01T16:00:00.000Z"),
      kayit("r2", "s2", "2026-08-15T16:40:00.000Z"),
    ]);
    expect(saat).toBe("19:20");
  });
});

describe("enCokGidilenDukkan — the most-visited shop", () => {
  it("is null for an empty history", () => {
    expect(enCokGidilenDukkan([])).toBeNull();
  });

  it("picks the shop with the most total visits", () => {
    const en = enCokGidilenDukkan([
      kayit("r1", "moda-firin", "2026-06-01T18:00:00.000Z"),
      kayit("r2", "moda-firin", "2026-07-01T18:00:00.000Z"),
      kayit("r3", "moda-firin", "2026-07-15T18:00:00.000Z"),
      kayit("r4", "yeldegirmeni", "2026-07-01T18:00:00.000Z"),
    ]);
    expect(en).toEqual({ storeId: "moda-firin", sayac: 3 });
  });

  it("breaks a tie by the most recently visited shop", () => {
    const en = enCokGidilenDukkan([
      kayit("r1", "eski-dukkan", "2026-06-01T18:00:00.000Z"),
      kayit("r2", "yeni-dukkan", "2026-07-01T18:00:00.000Z"),
    ]);
    expect(en?.storeId).toBe("yeni-dukkan");
  });
});

describe("the shopfront's own layout — a window AND a door, inside a pier each side", () => {
  it("keeps both openings inside the frame, with a pier between them", () => {
    const cerceveSol = CEPHE_PAY;
    const cerceveSag = DUKKAN_GENISLIK - CEPHE_PAY;
    expect(PENCERE_X).toBeGreaterThan(cerceveSol);
    expect(KAPI_X + KAPI_GENISLIK).toBeLessThan(cerceveSag);
    // The window ends before the door begins, and not flush against it —
    // the pier between them is what makes two openings read as a window
    // and a door rather than one wide band of colour.
    expect(PENCERE_X + PENCERE_GENISLIK).toBeLessThan(KAPI_X);
  });

  it("stands the door on the pavement and lifts the window onto a sill", () => {
    expect(PENCERE_ESIK).toBeGreaterThan(0);
    expect(KAPI_YUKSEKLIK).toBeGreaterThan(PENCERE_ESIK + PENCERE_YUKSEKLIK - 1);
    // Nothing in the shopfront pokes through its own head.
    expect(PENCERE_ESIK + PENCERE_YUKSEKLIK).toBeLessThan(VITRIN_YUKSEKLIK);
    expect(KAPI_YUKSEKLIK).toBeLessThan(VITRIN_YUKSEKLIK);
  });

  it("puts the ground floor — awning included — below every roofline it can draw", () => {
    expect(ZEMIN_KAT_YUKSEKLIK).toBeLessThan(DUKKAN_TABAN_YUKSEKLIK);
    expect(ZEMIN_KAT_YUKSEKLIK).toBeLessThan(KAPALI_DUKKAN_YUKSEKLIGI);
  });
});

describe("ustPencereler — the flats above a shop you keep going back to", () => {
  it("draws nothing above a one-time visit", () => {
    expect(ustPencereler(DUKKAN_TABAN_YUKSEKLIK, dukkanKatSayisi(1))).toEqual([]);
  });

  it("draws two windows per storey, one storey per repeat visit", () => {
    for (const sayac of [2, 3, DUKKAN_TEKRAR_TAVANI]) {
      const cati = dukkanYuksekligi(sayac);
      const pencereler = ustPencereler(cati, dukkanKatSayisi(sayac));
      expect(pencereler).toHaveLength(2 * dukkanKatSayisi(sayac));
    }
  });

  it("never crosses the awning below or the roof above", () => {
    for (const sayac of [2, 3, DUKKAN_TEKRAR_TAVANI, 50]) {
      for (const pay of [0, CATI_OYNAMA_TAVANI]) {
        const cati = dukkanYuksekligi(sayac) + pay;
        for (const pencere of ustPencereler(cati, dukkanKatSayisi(sayac))) {
          expect(pencere.taban).toBeGreaterThanOrEqual(ZEMIN_KAT_YUKSEKLIK);
          expect(pencere.taban + UST_PENCERE_YUKSEKLIK).toBeLessThan(cati);
          expect(pencere.x).toBeGreaterThanOrEqual(0);
          expect(pencere.x + UST_PENCERE_GENISLIK).toBeLessThanOrEqual(DUKKAN_GENISLIK);
        }
      }
    }
  });
});

describe("terasYolu / korniyYolu / partiDuvariYolu — a terrace, not a row of islands", () => {
  const tabanY = 40;

  it("is empty for an empty block", () => {
    expect(terasYolu([], tabanY)).toBe("");
  });

  it("draws every façade in ONE closed path with no gap between neighbours", () => {
    const yol = terasYolu([24, 29, 24], tabanY);
    // One move-to for the whole block: a single built thing, not three.
    expect(yol.match(/M/g)).toHaveLength(1);
    expect(yol.trim().endsWith("Z")).toBe(true);
    // The step from one parapet to the next happens ON the shared edge —
    // x=26 appears at both heights, so there is no dark street between.
    expect(yol).toContain(`L26,${tabanY - 24}`);
    expect(yol).toContain(`L26,${tabanY - 29}`);
    // …and the block ends exactly at the last façade's right edge.
    expect(yol).toContain(`L${3 * DUKKAN_GENISLIK},${tabanY}`);
  });

  it("gives every façade its own lit top edge", () => {
    const yol = korniyYolu([24, 29], tabanY);
    expect(yol.match(/M/g)).toHaveLength(2);
    expect(yol).toContain(`M0,${tabanY - 24} L26,${tabanY - 24}`);
  });

  it("draws a party wall at every interior boundary and none at the ends", () => {
    expect(partiDuvariYolu([24], tabanY)).toBe("");
    const yol = partiDuvariYolu([24, 29, 21], tabanY);
    expect(yol.match(/M/g)).toHaveLength(2);
    // A joint rises only to the LOWER of the two parapets it divides —
    // above that point there is only one building, and a line there
    // would be drawn across open sky.
    expect(yol).toContain(`M26,${tabanY} L26,${tabanY - 24}`);
    expect(yol).toContain(`M52,${tabanY} L52,${tabanY - 21}`);
  });
});

describe("isikHavuzuYolu — light landing on the pavement in front of a lit shop", () => {
  it("splays from the shopfront opening out to the building's full width at the kerb", () => {
    const yol = isikHavuzuYolu(0, 40);
    expect(yol).toBe(
      `M${CEPHE_PAY},40 L${DUKKAN_GENISLIK - CEPHE_PAY},40 L${DUKKAN_GENISLIK},${40 + KALDIRIM_KALINLIK} L0,${40 + KALDIRIM_KALINLIK} Z`,
    );
  });

  it("meets its neighbour's pool exactly at the party wall, never overlapping it", () => {
    // Two adjacent lit shops light a continuous strip of pavement; an
    // overlap would double the alpha and print a seam down the street.
    const sol = isikHavuzuYolu(0, 40);
    const sag = isikHavuzuYolu(DUKKAN_GENISLIK, 40);
    expect(sol).toContain(`L${DUKKAN_GENISLIK},${40 + KALDIRIM_KALINLIK}`);
    expect(sag).toContain(`L${DUKKAN_GENISLIK},${40 + KALDIRIM_KALINLIK}`);
  });
});

describe("dukkanPencereRengi — the window's colour, not just its opacity", () => {
  const KOYU = "#1A1207";
  const PARLAK = "#FFD79A";

  it("is exactly the dim colour at zero brightness", () => {
    expect(dukkanPencereRengi(KOYU, PARLAK, 0)).toBe("rgb(26,18,7)");
  });

  it("is exactly the bright colour at full brightness", () => {
    expect(dukkanPencereRengi(KOYU, PARLAK, 1)).toBe("rgb(255,215,154)");
  });

  it("is a real (opaque) colour string, not an alpha-based fill", () => {
    const renk = dukkanPencereRengi(KOYU, PARLAK, 0.5);
    expect(renk).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it("clamps out-of-range ratios rather than extrapolating past either end", () => {
    expect(dukkanPencereRengi(KOYU, PARLAK, -1)).toBe(dukkanPencereRengi(KOYU, PARLAK, 0));
    expect(dukkanPencereRengi(KOYU, PARLAK, 5)).toBe(dukkanPencereRengi(KOYU, PARLAK, 1));
  });

  // The brief's own bar: "one visit reads unmistakably as THIS ONE IS
  // YOURS". A ratio is not a picture, so this measures the picture — the
  // relative luminance the single-visit window actually resolves to
  // against the unlit interior it is lerped from, in every phase's own
  // pair of colours.
  it("puts a single visit's window far closer to the lamp than to the dark interior", () => {
    const parcala = (renk: string) =>
      renk
        .replace(/[^\d,]/g, "")
        .split(",")
        .map(Number) as [number, number, number];
    const isik = ([r, g, b]: [number, number, number]) =>
      (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

    // Each phase's own vitrinZemin against the sodium the glass lerps
    // toward (`sodyumDolgu`, the same lamp in every phase).
    const SODYUM = "#FFB23F";
    const fazlar: readonly (readonly [string, string])[] = [
      ["#1A1207", SODYUM],
      ["#37342B", SODYUM],
      ["#4A4740", SODYUM],
    ];
    for (const [zemin, cekirdek] of fazlar) {
      const sonuk = isik(parcala(dukkanPencereRengi(zemin, cekirdek, 0)));
      const yanik = isik(parcala(dukkanPencereRengi(zemin, cekirdek, 1)));
      const birKez = isik(
        parcala(dukkanPencereRengi(zemin, cekirdek, DUKKAN_TABAN_PARLAKLIK)),
      );
      const yol = (birKez - sonuk) / (yanik - sonuk);
      // Over halfway to the lamp, not a tenth of the way off the floor.
      expect(yol).toBeGreaterThan(0.5);
      // …and separating from the shop's OWN unlit interior by a real
      // contrast rather than a tint. Measured as a contrast ratio, not a
      // multiplier, because the day phase's interior is a mid neutral by
      // design and a multiplier would only be testing that.
      const oran = (birKez + 0.05) / (sonuk + 0.05);
      expect(oran).toBeGreaterThan(1.9);
    }
  });
});

describe("tenteYolu — the awning as a scalloped canopy, not a plain rectangle", () => {
  it("starts and ends the path at the flat top edge (attached to the wall)", () => {
    const yol = tenteYolu(26, 2, 2, 3);
    expect(yol.startsWith("M0,0")).toBe(true);
    expect(yol.trim().endsWith("Z")).toBe(true);
  });

  it("produces one closed path per call regardless of tooth count", () => {
    for (const disSayisi of [1, 2, 3, 4, 5]) {
      const yol = tenteYolu(26, 2, 2, disSayisi);
      expect(yol.trim().endsWith("Z")).toBe(true);
      // M + (2 for the top edge) + 2 points per tooth, closed with Z.
      const komutSayisi = yol.split(" ").length;
      expect(komutSayisi).toBe(1 + 2 + disSayisi * 2 + 1);
    }
  });

  it("never draws a tooth tip past the requested width", () => {
    const genislik = 26;
    const yol = tenteYolu(genislik, 2, 3, 3);
    const xDegerleri = [...yol.matchAll(/L?(-?\d+(?:\.\d+)?),/g)].map((m) => Number(m[1]));
    for (const x of xDegerleri) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(genislik);
    }
  });
});

describe("tenteSeritYolu — the awning's second colour, on its own scallops", () => {
  it("covers every other tooth, as one path of disjoint closed subpaths", () => {
    const yol = tenteSeritYolu(24, 2.5, 2, 6, 1);
    // Teeth 1, 3, 5 — three subpaths, each closed.
    expect(yol.match(/M/g)).toHaveLength(3);
    expect(yol.match(/Z/g)).toHaveLength(3);
  });

  it("draws the complementary teeth for the other parity, never the same ones", () => {
    const tek = tenteSeritYolu(24, 2.5, 2, 6, 1);
    const cift = tenteSeritYolu(24, 2.5, 2, 6, 0);
    expect(tek).not.toBe(cift);
    // The pair together is the whole canopy: no tooth is claimed twice
    // and none is left bare.
    const baslangiclar = (yol: string) => yol.match(/M(-?\d+(?:\.\d+)?),0/g) ?? [];
    const hepsi = new Set([...baslangiclar(tek), ...baslangiclar(cift)]);
    expect(hepsi.size).toBe(6);
  });

  it("stays inside the canopy it stripes", () => {
    const genislik = 24;
    const yol = tenteSeritYolu(genislik, 2.5, 2, 6, 1);
    const xDegerleri = [...yol.matchAll(/[ML](-?\d+(?:\.\d+)?),/g)].map((m) => Number(m[1]));
    for (const x of xDegerleri) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(genislik);
    }
  });
});
