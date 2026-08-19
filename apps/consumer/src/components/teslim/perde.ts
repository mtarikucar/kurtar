/**
 * The redeem ritual's arithmetic — spec §4.5. Pure, so the swipe
 * threshold, the haptic schedule, the guards and the code's spoken form
 * are all unit-testable without a device.
 *
 * Everything here is about ONE gesture: the customer holds the phone up
 * in front of a shop worker and pushes the shutter open. It is the only
 * place in the app where a kepenk goes UP, and it is the one interaction
 * that is worth this much arithmetic.
 */

import { Easing, Platform } from "react-native";
import { m } from "../../design/tokens";

/** Spec §4.5: "Drag up ≥140pt." An absolute distance, not a fraction of
 * the screen — the gesture is a shutter being pushed up, and a shutter
 * does not get easier to open on a bigger phone. */
export const KALDIRMA_ESIGI = 140;

/** The handle is 358 × 64 (spec §4.5 Accessibility). */
export const KOL_YUKSEKLIGI = 64;

/** How long the open state stays open before the shutter rolls back down
 * on its own. It is NEVER one-shot: re-swipe as many times as needed. */
export const ACIK_KALMA_SN = 30;

/** The roll back down: 400ms, no haptics (spec §4.5). */
export const INIS_SURESI = 400;

/** The sold-out-at-checkout slam (spec §4.4). */
export const CARPMA_SURESI = 240;

/** Under this many minutes left in the window, the redeem header warns
 * that the kepenk is about to come down (spec §4.5 Guards). */
export const UYARI_DK = 10;

/** Two failed drags and the app stops making the user guess: a plain
 * text button appears and never goes away again (spec §4.5). */
export const YARDIM_ESIGI = 2;

/**
 * A drag is measured in the direction a shutter actually travels: `dy` is
 * React Native's gesture delta, negative upward.
 */
export function kaldirmaMesafesi(dy: number): number {
  return Math.max(0, -dy);
}

export function kaldirmaYeterli(dy: number): boolean {
  return kaldirmaMesafesi(dy) >= KALDIRMA_ESIGI;
}

/** 0..1 — how far up the shutter has been pushed, for the live drag. */
export function kaldirmaOrani(dy: number): number {
  return Math.min(1, kaldirmaMesafesi(dy) / KALDIRMA_ESIGI);
}

/**
 * The locked shutter (outside the pickup window). It moves — a shutter
 * that does not move at all reads as a dead screen — but it fights back
 * hard and can never reach the threshold, so the gesture itself says
 * "not now" before any text does.
 *
 * A hyperbolic curve, not a linear scale: the first few points come
 * almost free and then it stiffens, which is what a bolted shutter feels
 * like. Asymptotically bounded well under `KALDIRMA_ESIGI`.
 */
export const KILITLI_TAVAN = 28;

export function direncliMesafe(dy: number): number {
  const ham = kaldirmaMesafesi(dy);
  return (KILITLI_TAVAN * ham) / (ham + KILITLI_TAVAN);
}

/**
 * Nine `impactAsync(Light)` calls inside 700ms smear into ONE continuous
 * buzz on an ERM motor, which is what most mid-range Androids still ship;
 * three read as corrugations on both platforms (spec §4.5).
 */
export function tikSayisi(platform: string = Platform.OS): number {
  return platform === "ios" ? 9 : 3;
}

const ROLL_EGRISI = Easing.bezier(0.16, 0.84, 0.3, 1);

/**
 * WHEN each corrugation passes the lip.
 *
 * The ticks are spaced evenly in DISTANCE and therefore unevenly in time:
 * `m.roll` is an ease-out, so the metal moves fast at the start and
 * settles at the end, and a tick per equal slice of travel comes out
 * decelerating — which is exactly what a real shutter sounds like.
 *
 * The curve is inverted numerically off the same easing the animation
 * runs, so the two cannot drift apart. Offsets are absolute ms from
 * gesture release; the caller turns them into absolute timestamps so they
 * do not drift against the UI-thread animation.
 *
 * The last tick is always exactly `sure` — it lands when the sign lights.
 */
export function tikZamanlari(adet: number, sure: number = m.roll): number[] {
  if (adet <= 0) return [];
  const zamanlar: number[] = [];
  for (let i = 1; i <= adet; i += 1) {
    const hedefIlerleme = i / adet;
    zamanlar.push(Math.round(egriTersi(hedefIlerleme) * sure));
  }
  return zamanlar;
}

/** Binary search over a monotonic easing curve. 24 iterations puts the
 * answer inside 1/16-millionth of the duration — far below a frame. */
function egriTersi(ilerleme: number): number {
  if (ilerleme >= 1) return 1;
  let alt = 0;
  let ust = 1;
  for (let i = 0; i < 24; i += 1) {
    const orta = (alt + ust) / 2;
    if (ROLL_EGRISI(orta) < ilerleme) alt = orta;
    else ust = orta;
  }
  return (alt + ust) / 2;
}

// ---------------------------------------------------------------------
// The code
// ---------------------------------------------------------------------

/**
 * The server's pickup code is `K-7F3M` (see backend's
 * reservation-code.util.ts): a fixed `K-` prefix plus four characters
 * from an alphabet that deliberately excludes 0/O/1/I, the glyphs that
 * are hard to tell apart when read aloud at a counter.
 *
 * That is the spec's four speakable characters, already: the prefix is
 * the same on every code in the system and therefore carries no
 * information, so the four that matter get the 44pt type and the prefix
 * stays with the full string on the ticket line below — where a staff
 * member matching the phone against the exact `K-7F3M` on their own
 * tablet can still see every character.
 *
 * Nothing here derives or reformats the code; it only decides which part
 * of the server's own string is set large.
 */
export const KOD_ON_EKI = "K-";

export interface KodParcalari {
  readonly onEk: string;
  readonly haneler: readonly string[];
  /** The server's string, verbatim — what the merchant tablet shows. */
  readonly tam: string;
}

export function kodParcalari(kod: string): KodParcalari {
  const temiz = kod.trim();
  const onEkli = temiz.startsWith(KOD_ON_EKI);
  const govde = onEkli ? temiz.slice(KOD_ON_EKI.length) : temiz;
  return {
    onEk: onEkli ? KOD_ON_EKI : "",
    haneler: [...govde],
    tam: temiz,
  };
}

/**
 * The code, announced character by character. A screen reader given
 * "K-7F3M" says something between "kay dash sevenefthreeem" and nothing
 * useful; separated by commas it reads them one at a time, which is what
 * somebody reading a code out to a shop worker needs (spec §4.5).
 */
export function kodHeceleme(kod: string): string {
  return [...kod.replace(/-/g, "")].join(", ");
}

// ---------------------------------------------------------------------
// The window guards (spec §4.5)
// ---------------------------------------------------------------------

export type PencereDurumu = "acilmadi" | "acik" | "kapandi";

export function pencereDurumu(
  simdiMs: number,
  baslangicMs: number,
  bitisMs: number,
): PencereDurumu {
  if (simdiMs < baslangicMs) return "acilmadi";
  if (simdiMs > bitisMs) return "kapandi";
  return "acik";
}

/** Whether the shutter may be lifted at all right now. */
export function kaldirilabilir(durum: PencereDurumu): boolean {
  return durum === "acik";
}

/** Minutes until the pickup window closes, floored, never negative. */
export function kapanmayaDk(simdiMs: number, bitisMs: number): number {
  return Math.max(0, Math.floor((bitisMs - simdiMs) / 60_000));
}

export function kepenkIniyorMu(simdiMs: number, bitisMs: number): boolean {
  const dk = kapanmayaDk(simdiMs, bitisMs);
  return simdiMs <= bitisMs && dk < UYARI_DK;
}

/**
 * Where "now" sits inside the pickup window, 0..1 — the ▲ on §4.3's
 * window rail. Clamped at both ends so a window that has not opened
 * pins the marker to the left edge rather than running off it, and a
 * zero-length window (a data accident, not a real one) reads as full
 * rather than dividing by zero.
 */
export function pencereOrani(
  simdiMs: number,
  baslangicMs: number,
  bitisMs: number,
): number {
  const uzunluk = bitisMs - baslangicMs;
  if (uzunluk <= 0) return 1;
  return Math.min(1, Math.max(0, (simdiMs - baslangicMs) / uzunluk));
}
