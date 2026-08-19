/**
 * Turkish clock strings.
 *
 * A time takes a locative suffix that has to agree with the LAST spoken
 * number — "18:30'da" (otuz), but "21:00'de" (yirmi bir) and "17:45'te"
 * (beş, and ş is voiceless). Hardcoding "'da" gets a third of the
 * pickup windows in the seed data wrong, and it is exactly the kind of
 * mistake that makes an app read as translated rather than written.
 */

/** [last vowel is a back vowel, last consonant is voiceless] */
const SAYI_SESI: Record<string, readonly [boolean, boolean]> = {
  sifir: [true, false], // sıfır
  bir: [false, false],
  iki: [false, false],
  uc: [false, true], // üç
  dort: [false, true], // dört
  bes: [false, true], // beş
  alti: [true, false], // altı
  yedi: [false, false],
  sekiz: [false, false],
  dokuz: [true, false],
  on: [true, false],
  yirmi: [false, false],
  otuz: [true, false],
  kirk: [true, true], // kırk
  elli: [false, false],
};

const BIRLER = ["sifir", "bir", "iki", "uc", "dort", "bes", "alti", "yedi", "sekiz", "dokuz"];
const ONLAR = ["sifir", "on", "yirmi", "otuz", "kirk", "elli"];

/** The word actually spoken last in a two-digit number. */
function sonSozcuk(n: number): string {
  const birler = n % 10;
  if (birler !== 0) return BIRLER[birler] ?? "sifir";
  const onlar = Math.floor(n / 10);
  if (onlar === 0) return "sifir";
  return ONLAR[onlar] ?? "on";
}

/**
 * The locative suffix for a "HH:MM" clock string: 'da / 'de / 'ta / 'te.
 * Minutes carry the suffix unless they are zero, in which case the hour
 * does.
 */
export function saatEki(hhmm: string): string {
  const [saatStr = "0", dakikaStr = "0"] = hhmm.split(":");
  const saat = Number.parseInt(saatStr, 10);
  const dakika = Number.parseInt(dakikaStr, 10);
  const sozcuk = dakika !== 0 ? sonSozcuk(dakika) : sonSozcuk(saat);
  const [kalin, sert] = SAYI_SESI[sozcuk] ?? [true, false];
  const unlu = kalin ? "a" : "e";
  const unsuz = sert ? "t" : "d";
  return `'${unsuz}${unlu}`;
}

/** "18:30'da", "21:00'de", "17:45'te". */
export function saatBulunma(hhmm: string): string {
  return `${hhmm}${saatEki(hhmm)}`;
}
