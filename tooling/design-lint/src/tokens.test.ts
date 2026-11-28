import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(join(root, path), "utf8").replaceAll("\r\n", "\n");
const styles = read("apps/web/src/components/styles.css");

type Oklch = { l: number; c: number; h: number; text: string };

function oklchTokens(css: string) {
  const tokens = new Map<string, Oklch>();
  for (const match of css.matchAll(
    /--([\w-]+):\s*(oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ [\d.]+%?)?\));/g,
  )) {
    tokens.set(match[1]!, {
      l: Number(match[3]),
      c: Number(match[4]),
      h: Number(match[5]),
      text: match[2]!,
    });
  }
  return tokens;
}

function block(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block`);
  return css.slice(start, css.indexOf("\n}", start));
}

const themes = {
  light: oklchTokens(block(styles, ":root")),
  dark: oklchTokens(block(styles, ".dark")),
};

const ACCENT = [
  "primary",
  "primary-foreground",
  "accent",
  "accent-foreground",
  "ring",
  "row-selected",
  "row-selected-foreground",
  "sidebar-accent",
  "chart-1",
];
const SEMANTIC = /^(?:chart-\d|destructive(?:-solid)?|success|warning(?:-text)?)$/;

void test("surfaces, borders, and text are neutral steps; colour lives in the accent and semantic tokens", () => {
  for (const [theme, tokens] of Object.entries(themes)) {
    for (const [name, value] of tokens) {
      if (ACCENT.includes(name) || SEMANTIC.test(name)) continue;
      assert.ok(
        value.c <= 0.012,
        `${theme} --${name} is tinted (chroma ${value.c}); keep it neutral`,
      );
    }
  }
});

void test("every accent token shares the primary hue, so the interface has one accent", () => {
  for (const [theme, tokens] of Object.entries(themes)) {
    const hue = tokens.get("primary")!.h;
    for (const name of ACCENT) {
      const value = tokens.get(name);
      if (!value || value.c === 0) continue;
      assert.equal(value.h, hue, `${theme} --${name} drifts from the primary hue`);
    }
  }
});

void test("server-rendered pages copy the renderer tokens", () => {
  const page = read("apps/server/src/shared/html-page.ts");
  const [light, dark] = page.split("@media (prefers-color-scheme: dark)");
  for (const [theme, css] of [
    ["light", light!],
    ["dark", dark!],
  ] as const) {
    const copied = oklchTokens(css);
    assert.ok(copied.size > 0);
    for (const [name, value] of copied)
      assert.equal(value.text, themes[theme].get(name)?.text, `${theme} --${name} in html-page.ts`);
  }
});

void test("emails and the app icon use the sRGB primary", () => {
  const email = read("apps/server/src/mail/transactional-email.tsx");
  const [light, dark] = [...email.matchAll(/accent: "(#[\da-f]{6})"/g)].map((match) => match[1]);
  assert.equal(light, hex(themes.light.get("primary")!), "light email accent");
  assert.equal(dark, hex(themes.dark.get("primary")!), "dark email accent");
  const darkButtonText = [...email.matchAll(/buttonText: "(#[\da-f]{6})"/g)][1]?.[1];
  assert.equal(
    darkButtonText,
    hex(themes.dark.get("primary-foreground")!),
    "dark email button text",
  );

  const icon = read("apps/desktop/assets/icon.svg");
  assert.ok(
    icon.includes(`fill="${hex(themes.light.get("primary")!)}"`),
    "apps/desktop/assets/icon.svg uses the light primary; regenerate icon.png, icon.ico, and icon.icns with it",
  );
});

void test("component stylesheets add no uppercase labels, negative tracking, or gradients", () => {
  const directory = join(root, "apps/web/src");
  const sheets = readdirSync(directory, { recursive: true, encoding: "utf8" }).filter((file) =>
    file.endsWith(".css"),
  );
  assert.ok(sheets.length > 0);
  for (const sheet of sheets) {
    const css = readFileSync(join(directory, sheet), "utf8");
    assert.doesNotMatch(css, /text-transform:\s*uppercase/, `${sheet}: uppercase label`);
    assert.doesNotMatch(css, /letter-spacing:\s*-/, `${sheet}: negative tracking`);
    assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(/, `${sheet}: gradient`);
  }
});

/** The sRGB hex of an OKLCH colour (Björn Ottosson's OKLab matrices), for email and icons. */
function hex({ l, c, h }: Oklch) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;
  const linear = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ];
  return `#${linear
    .map((channel) => {
      const x = Math.min(1, Math.max(0, channel));
      const encoded = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.round(encoded * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}
