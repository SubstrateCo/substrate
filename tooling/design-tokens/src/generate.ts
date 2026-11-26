import { transform } from "lightningcss";
import { createHash } from "node:crypto";
import { format } from "oxfmt";

type Declarations = Record<string, string>;

function declarations(block: string): Declarations {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+)\s*:\s*([^;]+)(?:;|$)/g)].map((match) => [
      match[1]!,
      match[2]!.trim().replace(/\s+/g, " "),
    ]),
  );
}

function block(source: string, selector: string): Declarations {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`, "g"))];
  if (matches.length !== 1) throw new Error(`Expected one ${selector} token block`);
  return declarations(matches[0]![1]!);
}

function resolve(name: string, tokens: Declarations, path: string[] = []): string {
  if (path.includes(name)) throw new Error(`Circular token: ${[...path, name].join(" -> ")}`);
  const value = tokens[name];
  if (!Object.hasOwn(tokens, name)) throw new Error(`Missing token: --${name}`);
  return value.replace(/var\(--([\w-]+)\)/g, (_, alias: string) =>
    resolve(alias, tokens, [...path, name]),
  );
}

// A relative color exposes extended sRGB before Lightning CSS gamut-maps legacy
// fallbacks. Clip those channels like Chromium's sRGB canvas; keep alpha unquantized.
export function nativeColor(value: string): string {
  const components: number[] = [];
  transform({
    filename: "token.css",
    code: Buffer.from(`.token{color:color(from ${value} srgb r g b / alpha)}`),
    visitor: {
      Color(color) {
        if (color.type === "srgb") components.push(color.r, color.g, color.b, color.alpha);
      },
    },
  });
  if (components.length !== 4 || !components.every(Number.isFinite)) {
    throw new Error(`Unsupported native color: ${value}`);
  }
  const channels = components
    .slice(0, 3)
    .map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255));
  const alpha = Number(components[3]!.toFixed(6));
  return `rgba(${channels.join(", ")}, ${alpha})`;
}

function pixels(value: string): number {
  const match = value.match(/^(-?[\d.]+)(rem|px)?$/);
  if (!match) throw new Error(`Unsupported native metric: ${value}`);
  return Number(match[1]) * (match[2] === "rem" ? 16 : 1);
}

function numeric(value: string): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Expected numeric token: ${value}`);
  return result;
}

function lineHeight(value: string, fontSize: number): number {
  const ratio = value.match(/^calc\(([\d.]+)\s*\/\s*([\d.]+)\)$/);
  const multiplier = ratio ? Number(ratio[1]) / Number(ratio[2]) : Number(value);
  const result = Number.isNaN(multiplier) ? pixels(value) : fontSize * multiplier;
  if (!Number.isFinite(result)) throw new Error(`Unsupported line height: ${value}`);
  return Number(result.toFixed(6));
}

function nativeShadow(value: string): string {
  let converted = 0;
  const result = value.replace(
    /(?:oklch|oklab|rgb|rgba|hsl|hsla|lab|lch|color)\([^()]*\)|#[\da-f]{3,8}\b/gi,
    (color) => {
      converted++;
      return nativeColor(color);
    },
  );
  if (!converted) throw new Error(`Unsupported native shadow: ${value}`);
  return result;
}

function sorted<T>(entries: [string, T][]): Record<string, T> {
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b, "en")));
}

function hexPalette(colors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(colors).map(([name, value]) => {
      const channels = value.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
      if (!channels) throw new Error(`Invalid generated color: ${value}`);
      const alpha = Number(channels[4]);
      const bytes = channels.slice(1, 4).map(Number);
      if (alpha !== 1) bytes.push(Math.round(alpha * 255));
      return [
        name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        `#${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`,
      ];
    }),
  );
}

export function extractTokens(webCss: string, tailwindCss: string) {
  const source = webCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const light = block(source, ":root");
  const dark = { ...light, ...block(source, ".dark") };
  const theme = block(source, "@theme inline");
  const defaults = declarations(tailwindCss);
  const resolvedTheme = { ...defaults, ...theme, ...light };
  if (dark.radius !== light.radius)
    throw new Error("Theme-dependent radius needs a native mapping");
  const names = new Set([...Object.keys(light), ...Object.keys(dark)]);
  const colors: string[] = [];

  for (const name of names) {
    const value = resolve(name, Object.hasOwn(light, name) ? light : dark);
    if (/^(?:oklch|oklab|rgb|rgba|hsl|hsla|lab|lch|color)\(|^#[\da-f]+$/i.test(value)) {
      colors.push(name);
    } else if (
      !["radius", "app-height", "spacing"].includes(name) &&
      !/^(?:ts-chart-tooltip-|elevation-|font-weight-|text-)/.test(name)
    ) {
      throw new Error(`Unclassified token --${name}: ${value}`);
    }
  }

  for (const [name, value] of Object.entries(theme)) {
    if (!name.startsWith("color-")) continue;
    const alias = value.match(/^var\(--([\w-]+)\)$/)?.[1];
    if (!alias || !colors.includes(alias)) throw new Error(`Missing semantic color: --${name}`);
  }

  const palette = (tokens: Declarations) =>
    sorted(colors.map((name) => [name, nativeColor(resolve(name, tokens))]));
  const radius = sorted(
    Object.entries(theme)
      .filter(([name]) => name.startsWith("radius-"))
      .map(([name, value]) => {
        const resolved = value.replace("var(--radius)", light.radius!);
        const calc = resolved.match(/^calc\(([\d.]+(?:rem|px)) \* ([\d.]+)\)$/);
        return [
          name.slice("radius-".length),
          calc ? Number((pixels(calc[1]!) * Number(calc[2])).toFixed(6)) : pixels(resolved),
        ];
      }),
  );
  const weights = (tokens: Declarations) =>
    sorted(
      Object.entries({ ...defaults, ...theme, ...tokens })
        .filter(([name]) => name.startsWith("font-weight-"))
        .map(([name, value]) => [name.slice("font-weight-".length), numeric(value)]),
    );
  const typography = sorted(
    Object.entries(resolvedTheme)
      .filter(
        ([name]) =>
          name.startsWith("text-") && !name.startsWith("text-shadow-") && !name.includes("--"),
      )
      .map(([name]) => {
        const height = resolve(`${name}--line-height`, resolvedTheme);
        const size = resolve(name, resolvedTheme);
        return [
          name.slice("text-".length),
          size.startsWith("clamp(")
            ? { responsiveFontSize: size, lineHeight: numeric(height) }
            : { fontSize: pixels(size), lineHeight: lineHeight(height, pixels(size)) },
        ];
      }),
  );
  const easing = sorted(
    Object.entries(theme)
      .filter(([name]) => name.startsWith("ease-"))
      .map(([name, value]) => {
        const match = value.match(/^cubic-bezier\(([^)]+)\)$/);
        if (!match) throw new Error(`Unsupported easing: ${value}`);
        const points = match[1]!.split(",").map((point) => numeric(point.trim()));
        if (points.length !== 4) throw new Error(`Invalid easing: ${value}`);
        return [name.slice("ease-".length), points];
      }),
  );
  const duration = sorted(
    Object.entries(theme)
      .filter(([name]) => name.startsWith("animate-"))
      .map(([name, value]) => {
        const match = value.match(/\s([\d.]+)(ms|s)\s/);
        if (!match) throw new Error(`Missing animation duration: ${value}`);
        return [name.slice("animate-".length), Number(match[1]) * (match[2] === "s" ? 1000 : 1)];
      }),
  );
  const elevationNames = new Set([
    "elevation-surface",
    "elevation-raised",
    "elevation-floating",
    ...Object.keys(light).filter((name) => name.startsWith("elevation-")),
    ...Object.keys(dark).filter((name) => name.startsWith("elevation-")),
  ]);
  const elevation = (tokens: Declarations) =>
    sorted(
      [...elevationNames].map((name) => [
        name.slice("elevation-".length),
        nativeShadow(resolve(name, tokens)),
      ]),
    );
  const spacing = pixels(resolve("spacing", resolvedTheme));
  if (!theme["font-sans"]) throw new Error("Missing sans font");
  return {
    themes: { light: palette(light), dark: palette(dark) },
    metrics: {
      radius,
      spacing: { unit: spacing },
      typography: { fontFamily: theme["font-sans"], roles: typography },
      fontWeight: { light: weights(light), dark: weights(dark) },
      elevation: { light: elevation(light), dark: elevation(dark) },
      motion: { easing, duration },
    },
  };
}

export async function generateFiles(
  webCss: string,
  tailwindCss: string,
): Promise<Record<string, string>> {
  const { themes, metrics } = extractTokens(webCss, tailwindCss);
  const mobileColors = {
    light: hexPalette(themes.light),
    dark: hexPalette(themes.dark),
  };
  const hash = createHash("sha256")
    .update(webCss.replace(/\r\n/g, "\n"))
    .update("\0")
    .update(tailwindCss.replace(/\r\n/g, "\n"))
    .digest("hex");
  const header = `Generated from apps/web/src/components/styles.css and Tailwind defaults. Do not edit.\nSource SHA-256: ${hash}`;
  const css = Object.entries(themes)
    .map(([name, colors]) => {
      const entries = Object.entries(colors).map(([key, value]) => `  --${key}: ${value};`);
      return `${name === "light" ? ":root" : ".dark"} {\n${entries.join("\n")}\n}`;
    })
    .join("\n\n");
  const files = {
    "src/generated.ts": `/* ${header} */\nexport const themes = ${JSON.stringify(themes, null, 2)} as const;\n\nexport const metrics = ${JSON.stringify(metrics, null, 2)} as const;\n\nexport type ThemeName = keyof typeof themes;\nexport type ColorToken = keyof typeof themes.light;\n`,
    "nativewind.css": `/* ${header} */\n${css}\n`,
    "src/mobile/generated.ts": `/* ${header} */\nimport { metrics } from "../generated.ts";\nexport const mobileTheme = {\nlight: ${JSON.stringify(mobileColors.light, null, 2)},\ndark: ${JSON.stringify(mobileColors.dark, null, 2)},\nradius: metrics.radius.lg,\nradii: metrics.radius,\nmetrics,\n} as const;\n`,
    "src/mobile/index.ts":
      'export { mobileTheme } from "./generated.ts";\nexport { metrics } from "../generated.ts";\n',
  };
  return Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([path, content]) => {
        const formatted = await format(path, content);
        if (formatted.errors.length) throw new Error(`Cannot format generated token file: ${path}`);
        return [path, formatted.code];
      }),
    ),
  );
}

export function checkFiles(
  expected: Record<string, string>,
  actual: Record<string, string | undefined>,
): void {
  const drifted = Object.keys(expected).filter(
    (path) => expected[path] !== actual[path]?.replace(/\r\n/g, "\n"),
  );
  if (drifted.length) {
    throw new Error(`Design token drift: ${drifted.join(", ")}. Run bun run tokens:generate.`);
  }
}
