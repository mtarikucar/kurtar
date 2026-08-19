/**
 * WCAG 2.x relative-luminance contrast, used by design-contrast.test.ts to
 * hold the palette to the ratios §1.1 publishes. Kept in `design/` rather
 * than in the test file because the ratios are a property OF the palette:
 * anyone changing a token can check it here.
 */
function kanal(v: number): number {
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function rgbCoz(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const tam =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (!/^[0-9a-fA-F]{6}$/.test(tam)) {
    throw new Error(`rgbCoz: opak bir hex bekleniyordu, "${hex}" geldi`);
  }
  return [
    parseInt(tam.slice(0, 2), 16),
    parseInt(tam.slice(2, 4), 16),
    parseInt(tam.slice(4, 6), 16),
  ];
}

export function parlaklik(hex: string): number {
  const [r, g, b] = rgbCoz(hex).map((v) => kanal(v / 255)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function kontrastOrani(a: string, b: string): number {
  const la = parlaklik(a);
  const lb = parlaklik(b);
  const yuksek = Math.max(la, lb);
  const dusuk = Math.min(la, lb);
  return (yuksek + 0.05) / (dusuk + 0.05);
}
