import type { Faz } from "./tokens";

/**
 * Phase logic — spec §1.1. Pure functions, unit-testable at any
 * timestamp, three DISCRETE phases and never an interpolation.
 */

/** Twilight opens 45 minutes before sunset. */
export const GUNDUZ_ESIGI_DK = -45;
/** Night starts 25 minutes after sunset. */
export const GECE_ESIGI_DK = 25;

/** The spec's function, verbatim: minutes either side of sunset. */
export function faz(now: Date, sunset: Date): Faz {
  const d = (now.getTime() - sunset.getTime()) / 60000; // dk
  if (d < GUNDUZ_ESIGI_DK) return "gunduz";
  if (d < GECE_ESIGI_DK) return "alacakaranlik";
  return "gece";
}

/**
 * What the ThemeProvider actually calls.
 *
 * `faz()` alone has a hole the spec doesn't cover: between local midnight
 * and sunrise, "now" is dozens of minutes BEFORE that day's sunset, so the
 * bare function returns `gunduz` — a bright ivory street at 04:00, which
 * is exactly the daylight-inversion bug the spec grafted from Son Işık to
 * fix, running in the other direction. Before sunrise it is still last
 * night, so it is `gece`; after sunrise the spec's rule takes over
 * unchanged.
 */
export function fazHesapla(now: Date, olaylar: GunesOlaylari): Faz {
  if (now.getTime() < olaylar.dogus.getTime()) return "gece";
  return faz(now, olaylar.batis);
}

/** Kadıköy — the fallback location, and the one the app names when the
 * user declines location (spec §4.8: "Konumun kapalı. Kadıköy'ü
 * gösteriyoruz."). */
export const VARSAYILAN_KONUM = Object.freeze({
  enlem: 40.9903,
  boylam: 29.03,
} as const);

export interface GunesOlaylari {
  /** Sunrise. */
  readonly dogus: Date;
  /** Sunset — the instant every phase threshold is measured against. */
  readonly batis: Date;
  /** Solar noon. */
  readonly gecis: Date;
}

const RAD = Math.PI / 180;
const J2000 = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;
/** Refraction-corrected solar altitude at sunrise/sunset. */
const UFUK_YUKSEKLIGI = -0.833;
/** Obliquity of the ecliptic. */
const EGIKLIK = 23.4397;

function jdOf(t: Date): number {
  return t.getTime() / 86400000 + UNIX_EPOCH_JD;
}

function jdToDate(jd: number): Date {
  return new Date((jd - UNIX_EPOCH_JD) * 86400000);
}

/**
 * Sunrise/sunset/solar noon for a lat/lng, computed locally — no network,
 * ever (spec §1.1). The standard low-precision sunrise equation; checked
 * against published times for İstanbul, London and New York in
 * design-faz.test.ts, where it lands within a minute — three orders of
 * magnitude finer than the 45-minute threshold it feeds.
 *
 * In the polar cases the equation has no solution, and rather than
 * returning NaN it degrades to the honest answer: the sun never sets
 * (sunrise = solar noon − 12h, sunset = +12h, so the phase never leaves
 * day) or never rises (sunrise is pushed past the day's end, so it is
 * night throughout). Turkey reaches neither; a crash at 78°N is not an
 * acceptable alternative.
 */
export function gunesOlaylari(
  gun: Date,
  enlem: number,
  boylam: number,
): GunesOlaylari {
  const n = Math.round(jdOf(gun) - J2000 - 0.0009);
  const jYildiz = n + 0.0009 - boylam / 360;

  const M = (357.5291 + 0.98560028 * jYildiz) % 360;
  const C =
    1.9148 * Math.sin(M * RAD) +
    0.02 * Math.sin(2 * M * RAD) +
    0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;

  const jGecis =
    J2000 +
    jYildiz +
    0.0053 * Math.sin(M * RAD) -
    0.0069 * Math.sin(2 * lambda * RAD);

  const sinDelta = Math.sin(lambda * RAD) * Math.sin(EGIKLIK * RAD);
  const cosDelta = Math.cos(Math.asin(sinDelta));

  const cosOmega =
    (Math.sin(UFUK_YUKSEKLIGI * RAD) - Math.sin(enlem * RAD) * sinDelta) /
    (Math.cos(enlem * RAD) * cosDelta);

  const gecis = jdToDate(jGecis);

  if (cosOmega > 1) {
    // Polar night: the sun stays below the horizon all day, so sunrise is
    // pushed past the end of the day and sunset is put half a day behind
    // it — both branches then read "night", which is what it is.
    return {
      dogus: jdToDate(jGecis + 0.5),
      batis: jdToDate(jGecis - 0.5),
      gecis,
    };
  }
  if (cosOmega < -1) {
    // Midnight sun: it never crosses the horizon.
    return { dogus: jdToDate(jGecis - 0.5), batis: jdToDate(jGecis + 0.5), gecis };
  }

  const omega = Math.acos(cosOmega) / RAD / 360;
  return {
    dogus: jdToDate(jGecis - omega),
    batis: jdToDate(jGecis + omega),
    gecis,
  };
}

/** Sunset only — the value `faz()` takes. */
export function gunBatimi(gun: Date, enlem: number, boylam: number): Date {
  return gunesOlaylari(gun, enlem, boylam).batis;
}
