interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(hex: string): Rgb {
  const digits = hex.length === 4 ? hex.slice(1).replace(/./g, "$&$&") : hex.slice(1);
  const value = Number.parseInt(digits, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function mix(a: string, b: string, amount: number): string {
  const from = parseHex(a);
  const to = parseHex(b);
  return toHex({
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  });
}

export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return 255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return toHex({ r: channel(0), g: channel(8), b: channel(4) });
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
