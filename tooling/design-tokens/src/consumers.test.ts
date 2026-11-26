import mobileConfig from "../../../apps/mobile/tailwind.config.ts";
import { metrics, mobileTheme } from "../../../packages/design-tokens/src/mobile/index.ts";
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

describe("shared TypeScript token consumers", () => {
  test("Bun loads the same metrics through the mobile entry and Tailwind config", () => {
    expect(mobileTheme.metrics).toBe(metrics);
    expect(mobileConfig.theme.extend.fontSize.sm).toEqual([
      `${metrics.typography.roles.sm.fontSize}px`,
      { lineHeight: `${metrics.typography.roles.sm.lineHeight}px` },
    ]);
    expect(mobileConfig.theme.extend.spacing["4"]).toBe(`${metrics.spacing.unit * 4}px`);
    expect(mobileConfig.theme.extend.borderRadius.lg).toBe(`${metrics.radius.lg}px`);
  });

  test("Node Tailwind 3 and the NativeWind 4 Metro config loader both load the TS entry", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const result = spawnSync(
      "node",
      [
        "--input-type=module",
        "--eval",
        `
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
const require = createRequire(resolve("apps/mobile/package.json"));
const loadConfig = require("tailwindcss/loadConfig");
const nativewind = dirname(require.resolve("nativewind/package.json"));
const { tailwindConfig } = require(join(nativewind, "dist/metro/tailwind/index.js"));
const direct = loadConfig(resolve("apps/mobile/tailwind.config.ts"));
const metro = tailwindConfig(resolve("apps/mobile/tailwind.config"));
console.log(JSON.stringify({
  directSmall: direct.theme.extend.fontSize.sm,
  metroSmall: metro.theme.extend.fontSize.sm,
  metroRadius: metro.theme.extend.borderRadius.lg,
  metroDark: metro.darkMode,
}));
`,
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    const loaded = JSON.parse(result.stdout);
    const small = [
      `${metrics.typography.roles.sm.fontSize}px`,
      { lineHeight: `${metrics.typography.roles.sm.lineHeight}px` },
    ];
    expect(loaded.directSmall).toEqual(small);
    expect(loaded.metroSmall).toEqual(small);
    expect(loaded.metroRadius).toBe(`${metrics.radius.lg}px`);
    expect(loaded.metroDark).toBe("class");
  });
});
