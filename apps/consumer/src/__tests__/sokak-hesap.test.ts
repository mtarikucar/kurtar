import {
  ayGenisligi,
  ayGenisligiDevamli,
  aylaraGrupla,
  dukkanParlakligi,
  dukkanPencereRengi,
  dukkanPencereX,
  dukkanYuksekligi,
  dukkanZiyaretSayilari,
  enCokGidilenDukkan,
  enSikSaat,
  tenteYolu,
  KALDIRIM_Y,
  KAPALI_DUKKAN_YUKSEKLIGI,
  SOKAK_DEVAM_DUKKAN_SAYISI,
  SOKAK_SVG_YUKSEKLIGI,
  DUKKAN_GENISLIK,
  DUKKAN_ARALIK,
  DUKKAN_PENCERE_GENISLIK,
  DUKKAN_TABAN_YUKSEKLIK,
  DUKKAN_TEKRAR_TAVANI,
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
    expect(dukkanParlakligi(1)).toBeCloseTo(0.3, 5);
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

  it("never exceeds the fixed <Svg> height the street reserves", () => {
    const enUzun = dukkanYuksekligi(50);
    // tente + gap + body must fit inside SOKAK_SVG_YUKSEKLIGI, above the
    // 1pt pavement line.
    expect(KALDIRIM_Y - enUzun).toBeGreaterThanOrEqual(0);
    expect(SOKAK_SVG_YUKSEKLIGI).toBeGreaterThan(enUzun);
  });
});

describe("ayGenisligi — one <Svg> per month, no per-shop node beyond a rect and a stripe", () => {
  it("is zero for an empty month", () => {
    expect(ayGenisligi(0)).toBe(0);
  });

  it("sums storefront widths with gaps between, no trailing gap", () => {
    expect(ayGenisligi(1)).toBe(DUKKAN_GENISLIK);
    expect(ayGenisligi(3)).toBe(DUKKAN_GENISLIK * 3 + DUKKAN_ARALIK * 2);
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

  it("still fits under the street's fixed <Svg> height", () => {
    expect(KALDIRIM_Y - KAPALI_DUKKAN_YUKSEKLIGI).toBeGreaterThanOrEqual(0);
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

describe("dukkanPencereX — the window sits inset from the awning's own edges", () => {
  it("centres the (narrower) window inside the (wider) awning slot", () => {
    const ice = (DUKKAN_GENISLIK - DUKKAN_PENCERE_GENISLIK) / 2;
    expect(dukkanPencereX(0)).toBe(ice);
    expect(dukkanPencereX(100)).toBe(100 + ice);
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
