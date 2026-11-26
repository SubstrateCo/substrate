import { checkFiles, extractTokens, generateFiles, nativeColor } from "./generate.ts";
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type MobileExports = {
  metrics: ReturnType<typeof extractTokens>["metrics"];
  mobileTheme: {
    light: Record<string, string>;
    dark: Record<string, string>;
    radius: number;
    radii: Record<string, number>;
    metrics: ReturnType<typeof extractTokens>["metrics"];
  };
};

const defaults = `
@theme default {
  --spacing: 0.25rem;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --text-sm: 0.875rem;
  --text-sm--line-height: calc(1.25 / 0.875);
  --text-base: 1rem;
  --text-base--line-height: 1.5;
}
`;
const source = `
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: "Geist Variable", sans-serif;
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --text-compact: 0.8125rem;
  --text-compact--line-height: 1.25rem;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --animate-collapsible-down: collapsible-down 180ms var(--ease-out);
}
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0 0 0);
  --card-foreground: var(--foreground);
  --overlay: oklch(0 0 0 / 5%);
  --elevation-surface: 0 1px 2px oklch(0 0 0 / 5%);
  --elevation-raised: 0 1px 3px oklch(0 0 0 / 6%);
  --elevation-floating: 0 4px 8px -2px oklch(0 0 0 / 8%), 0 16px 40px -8px oklch(0 0 0 / 18%);
  --radius: 0.5rem;
}
.dark {
  --background: oklch(0 0 0);
  --foreground: oklch(1 0 0);
  --overlay: oklch(1 0 0 / 9%);
  --font-weight-normal: 340;
  --elevation-floating: 0 4px 12px oklch(0 0 0 / 20%), 0 20px 48px -12px oklch(0 0 0 / 45%);
}
`;

describe("canonical web token extraction", () => {
  test("clips extended sRGB like Chromium instead of gamut-mapping the destructive red", () => {
    // Chromium's sRGB canvas renders this canonical web value as (201, 0, 9).
    // Lightning CSS's legacy fallback instead gamut-maps it to (198, 0, 17).
    expect(nativeColor("oklch(0.52 0.22 27.325)")).toBe("rgba(201, 0, 9, 1)");
    expect(nativeColor("oklch(0.52 0.22 27.325 / 40%)")).toBe("rgba(201, 0, 9, 0.4)");
  });

  test("resolves inherited aliases against each theme and preserves overlay alpha", () => {
    const { themes, metrics } = extractTokens(source, defaults);
    expect(themes.light["card-foreground"]).toBe("rgba(0, 0, 0, 1)");
    expect(themes.dark["card-foreground"]).toBe("rgba(255, 255, 255, 1)");
    expect(themes.light.overlay).toBe("rgba(0, 0, 0, 0.05)");
    expect(themes.dark.overlay).toBe("rgba(255, 255, 255, 0.09)");
    expect(metrics.fontWeight.light.normal).toBe(400);
    expect(metrics.fontWeight.dark.normal).toBe(340);
    expect(metrics.fontWeight.dark.medium).toBe(500);
    expect(metrics.radius.md).toBe(6.4);
    expect(metrics.spacing.unit).toBe(4);
    expect(metrics.typography.roles.compact).toEqual({ fontSize: 13, lineHeight: 20 });
    expect(metrics.motion.duration["collapsible-down"]).toBe(180);
    expect(metrics.motion.easing.out).toEqual([0.23, 1, 0.32, 1]);
  });

  test("includes new semantic colors even without a Tailwind alias", () => {
    const changed = source.replace("--radius: 0.5rem;", "--radius: 0.5rem; --new-role: #123456;");
    expect(extractTokens(changed, defaults).themes.light["new-role"]).toBe("rgba(18, 52, 86, 1)");
    expect(
      extractTokens(changed.replace("--new-role: #123456;", "--new-role: #123456"), defaults).themes
        .light["new-role"],
    ).toBe("rgba(18, 52, 86, 1)");
  });

  test("resolves default font roles, web overrides, and spacing overrides", () => {
    const extracted = extractTokens(source, defaults);
    expect(extracted.metrics.typography.roles.sm).toEqual({ fontSize: 14, lineHeight: 20 });
    expect(extracted.metrics.typography.roles.base).toEqual({ fontSize: 16, lineHeight: 24 });
    const changed = source.replace(
      "@theme inline {",
      "@theme inline { --text-sm: 1rem; --text-sm--line-height: 1.5rem; --spacing: 0.5rem;",
    );
    const { metrics } = extractTokens(changed, defaults);
    expect(metrics.typography.roles.sm).toEqual({ fontSize: 16, lineHeight: 24 });
    expect(metrics.typography.roles.compact).toEqual({ fontSize: 13, lineHeight: 20 });
    expect(metrics.spacing.unit).toBe(8);
  });

  test("converts both shadow layers and updates only the changed dark elevation", () => {
    const original = extractTokens(source, defaults);
    expect(original.metrics.elevation.light.floating).toBe(
      "0 4px 8px -2px rgba(0, 0, 0, 0.08), 0 16px 40px -8px rgba(0, 0, 0, 0.18)",
    );
    const { metrics } = extractTokens(
      source.replace(
        "0 20px 48px -12px oklch(0 0 0 / 45%)",
        "0 22px 50px -10px oklch(1 0 0 / 55%)",
      ),
      defaults,
    );
    expect(metrics.elevation.light).toEqual(original.metrics.elevation.light);
    expect(metrics.elevation.dark.floating).toBe(
      "0 4px 12px rgba(0, 0, 0, 0.2), 0 22px 50px -10px rgba(255, 255, 255, 0.55)",
    );
  });

  test("rejects missing elevation roles and missing default font line heights", () => {
    expect(() => extractTokens(source.replace(/--elevation-surface:[^;]+;/, ""), defaults)).toThrow(
      "Missing token: --elevation-surface",
    );
    expect(() =>
      extractTokens(source, defaults.replace(/--text-sm--line-height:[^;]+;/, "")),
    ).toThrow("Missing token: --text-sm--line-height");
  });

  test("rejects missing aliases, cycles, and unclassified tokens rather than omitting them", () => {
    expect(() =>
      extractTokens(source.replace("--foreground: oklch(0 0 0);", ""), defaults),
    ).toThrow("Missing token: --foreground");
    expect(() =>
      extractTokens(
        source.replace("--foreground: oklch(0 0 0);", "--foreground: var(--card-foreground);"),
        defaults,
      ),
    ).toThrow("Circular token");
    expect(() =>
      extractTokens(
        source.replace("--radius: 0.5rem;", "--radius: 0.5rem; --new-role: unknown;"),
        defaults,
      ),
    ).toThrow("Unclassified token --new-role");
  });
});

describe("zero drift verification", () => {
  test("has the same output and check result on Windows and Unix checkouts", async () => {
    const unix = await generateFiles(source, defaults);
    const windows = await generateFiles(
      source.replace(/\n/g, "\r\n"),
      defaults.replace(/\n/g, "\r\n"),
    );
    expect(windows).toEqual(unix);
    const checkout = Object.fromEntries(
      Object.entries(unix).map(([path, value]) => [path, value.replace(/\n/g, "\r\n")]),
    );
    expect(() => checkFiles(unix, checkout)).not.toThrow();
  });

  test("generates the TypeScript mobile entry from canonical themes, including alpha and radii", async () => {
    const files = await generateFiles(source, defaults);
    const directory = await mkdtemp(join(tmpdir(), "substrate-token-test-"));
    let exports: MobileExports;
    try {
      await mkdir(join(directory, "mobile"));
      await writeFile(join(directory, "generated.ts"), files["src/generated.ts"]!);
      await writeFile(join(directory, "mobile/generated.ts"), files["src/mobile/generated.ts"]!);
      await writeFile(join(directory, "mobile/index.ts"), files["src/mobile/index.ts"]!);
      exports = await import(pathToFileURL(join(directory, "mobile/index.ts")).href);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    expect(exports.mobileTheme.light.cardForeground).toBe("#000000");
    expect(exports.mobileTheme.dark.cardForeground).toBe("#ffffff");
    expect(exports.mobileTheme.light.overlay).toBe("#0000000d");
    expect(exports.mobileTheme.dark.overlay).toBe("#ffffff17");
    expect(exports.mobileTheme.radius).toBe(8);
    expect(exports.mobileTheme.radii.md).toBe(6.4);
    expect(exports.metrics.typography.roles.sm).toEqual({ fontSize: 14, lineHeight: 20 });
    expect(exports.mobileTheme.metrics).toEqual(exports.metrics);
    expect(exports.metrics.fontWeight.dark.normal).toBe(340);
    expect(exports.metrics.spacing.unit).toBe(4);
    expect(exports.metrics.elevation.dark.floating).toBe(
      "0 4px 12px rgba(0, 0, 0, 0.2), 0 20px 48px -12px rgba(0, 0, 0, 0.45)",
    );
  });

  test("detects edited, omitted, and absent generated output", async () => {
    const expected = await generateFiles(source, defaults);
    expect(() => checkFiles(expected, expected)).not.toThrow();
    expect(() =>
      checkFiles(expected, {
        ...expected,
        "src/generated.ts": expected["src/generated.ts"]!.replace("255", "254"),
      }),
    ).toThrow("Design token drift: src/generated.ts");
    expect(() =>
      checkFiles(expected, {
        ...expected,
        "nativewind.css": expected["nativewind.css"]!.replace(/.*--overlay:.*\n/g, ""),
      }),
    ).toThrow("Design token drift: nativewind.css");
    expect(() => checkFiles(expected, {})).toThrow("Design token drift");
  });

  test("detects canonical color and dark-only override changes", async () => {
    const original = await generateFiles(source, defaults);
    const changed = await generateFiles(
      source.replace("--overlay: oklch(1 0 0 / 9%);", "--overlay: oklch(1 0 0 / 18%);"),
      defaults,
    );
    expect(() => checkFiles(changed, original)).toThrow("Design token drift");
    const { themes } = extractTokens(
      source.replace("--overlay: oklch(1 0 0 / 9%);", "--overlay: oklch(1 0 0 / 18%);"),
      defaults,
    );
    expect(themes.light.overlay).toBe("rgba(0, 0, 0, 0.05)");
    expect(themes.dark.overlay).toBe("rgba(255, 255, 255, 0.18)");
  });

  test("detects a new canonical role missing from previously generated tokens", async () => {
    const old = await generateFiles(source, defaults);
    const changed = await generateFiles(
      source.replace("--radius: 0.5rem;", "--radius: 0.5rem; --new-role: #123456;"),
      defaults,
    );
    expect(() => checkFiles(changed, old)).toThrow("Design token drift");
  });

  test("checked-in native outputs match the current real web stylesheet", async () => {
    const root = new URL("../../../", import.meta.url);
    const web = await readFile(new URL("apps/web/src/components/styles.css", root), "utf8");
    const tailwind = await readFile(new URL(import.meta.resolve("tailwindcss/theme.css")), "utf8");
    const expected = await generateFiles(web, tailwind);
    const actual = Object.fromEntries(
      await Promise.all(
        Object.keys(expected).map(async (path) => [
          path,
          await readFile(new URL(`packages/design-tokens/${path}`, root), "utf8"),
        ]),
      ),
    );
    expect(() => checkFiles(expected, actual)).not.toThrow();
  });
});
