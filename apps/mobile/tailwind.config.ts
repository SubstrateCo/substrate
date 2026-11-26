import { mobileTheme, metrics } from "@substrate/design-tokens/mobile";

import geistWeights from "./src/theme/geist-weights.json";
import nativewind from "nativewind/preset";
import { hairlineWidth } from "nativewind/theme";
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import defaultTheme from "tailwindcss/defaultTheme";
import plugin from "tailwindcss/plugin";

const defaultSpacing = defaultTheme.spacing;

const themes = { light: mobileTheme.light, dark: mobileTheme.dark };
const staticFonts = Object.values(geistWeights).map((family) => {
  const match = family.match(/_(\d+)/);
  if (!match) throw new Error(`Missing static font weight: ${family}`);
  return { family, weight: Number(match[1]) };
});

// Native uses the closest loaded static asset, while metrics retain the exact web weight.
const fontFamilies = Object.fromEntries(
  Object.entries(metrics.fontWeight).map(([mode, weights]) => [
    mode,
    Object.fromEntries(
      Object.entries(weights).map(([role, weight]) => [
        role,
        staticFonts.reduce((closest, candidate) =>
          Math.abs(candidate.weight - weight) < Math.abs(closest.weight - weight)
            ? candidate
            : closest,
        ).family,
      ]),
    ),
  ]),
);

function fontVariables(mode: keyof typeof themes) {
  return Object.fromEntries(
    Object.entries(fontFamilies[mode]).map(([role, family]) => [`--font-family-${role}`, family]),
  );
}

function parseColor(token: string, value: string) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i.exec(value);
  if (!match)
    throw new Error(`Design token ${token} is not a #rrggbb or #rrggbbaa color: ${value}`);
  const [, r, g, b, a = "ff"] = match;
  const alpha = parseInt(a, 16) / 255;
  const channels = [r!, g!, b!].map((pair) => parseInt(pair, 16)).join(" ");
  return {
    channels,
    alpha,
    css: `rgba(${channels.replaceAll(" ", ", ")}, ${Number(alpha.toFixed(3))})`,
  };
}

// SAFETY: these are the typed palette's own enumerable keys.
const tokenNames = Object.keys(themes.light) as (keyof typeof themes.light)[];
const cssName = (token: string) => token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const translucent = new Set(
  tokenNames.filter((token) =>
    Object.values(themes).some((theme) => parseColor(token, theme[token]).alpha < 1),
  ),
);

// Opaque tokens keep Tailwind opacity modifiers. Translucent tokens keep their own alpha, so a modifier has no effect.
function cssVariables(theme: Record<keyof typeof themes.light, string>) {
  return Object.fromEntries(
    tokenNames.map((token) => {
      const color = parseColor(token, theme[token]);
      return [`--${cssName(token)}`, translucent.has(token) ? color.css : color.channels];
    }),
  );
}

const colors = Object.fromEntries(
  tokenNames.map((token) => {
    const name = cssName(token);
    return [
      name,
      translucent.has(token) ? `var(--${name})` : `rgb(var(--${name}) / <alpha-value>)`,
    ];
  }),
);

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  // Tailwind drops base rules for classes it does not find in content. Keep the dark theme variables.
  safelist: ["dark"],
  presets: [nativewind],
  corePlugins: {
    fontWeight: false,
  },
  theme: {
    extend: {
      colors,
      fontSize: Object.fromEntries(
        Object.entries(metrics.typography.roles).flatMap(([role, value]) =>
          "fontSize" in value
            ? [[role, [`${value.fontSize}px`, { lineHeight: `${value.lineHeight}px` }]]]
            : [],
        ),
      ),
      spacing: Object.fromEntries(
        Object.entries(defaultSpacing).map(([step, value]) => [
          step,
          step === "px" ? value : `${Number(step) * metrics.spacing.unit}px`,
        ]),
      ),
      borderRadius: Object.fromEntries(
        Object.entries(mobileTheme.radii).map(([size, px]) => [size, `${px}px`]),
      ),
      borderWidth: {
        hairline: hairlineWidth(),
      },
      fontFamily: {
        sans: ["var(--font-family-normal)"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [
    animate,
    plugin((api) => {
      api.addBase({
        ":root": { ...cssVariables(themes.light), ...fontVariables("light") },
        ".dark:root": { ...cssVariables(themes.dark), ...fontVariables("dark") },
      });
      // Each loaded Geist file is its own family, so weight classes select the file instead of setting font-weight.
      api.addUtilities(
        Object.fromEntries(
          Object.keys(metrics.fontWeight.light).map((weight) => [
            `.font-${weight}`,
            { fontFamily: `var(--font-family-${weight})` },
          ]),
        ),
      );
    }),
  ],
} satisfies Config;
