import { contrast } from "../color/color.ts";
import { agentAvatarLook, generateAvatar } from "./generate.ts";
import { BODIES, BODY_COLOR_NAMES } from "./presets.ts";
import { eyeSurfaceColors, resolvePalette } from "./resolve.ts";
import { describe, expect, test } from "bun:test";

const seeds = Array.from({ length: 400 }, (_, i) => `agent-${i}`);

describe("generateAvatar", () => {
  test("gives the same avatar for the same seed", () => {
    expect(generateAvatar("support-bot")).toEqual(generateAvatar("support-bot"));
  });

  test("keeps the eyes readable on every body it generates", () => {
    for (const seed of seeds) {
      const config = generateAvatar(seed);
      const eye = resolvePalette(config).eye;
      const worst = Math.min(...eyeSurfaceColors(config).map((surface) => contrast(eye, surface)));
      expect({ seed, readable: worst >= 3 }).toEqual({ seed, readable: true });
    }
  });

  test("spreads seeds across shapes, eyes and invented colours", () => {
    const configs = seeds.map((seed) => generateAvatar(seed));
    expect(new Set(configs.map((c) => c.body)).size).toBe(6);
    expect(new Set(configs.map((c) => c.eyes)).size).toBe(6);
    expect(configs.some((c) => c.color.startsWith("#"))).toBe(true);
    expect(configs.some((c) => !c.color.startsWith("#"))).toBe(true);
  });

  test("only picks from the allowed options", () => {
    for (const seed of seeds.slice(0, 50)) {
      const config = generateAvatar(seed, {
        bodies: ["blob"],
        colors: ["teal"],
        eyes: ["dot"],
        customColorShare: 0,
      });
      expect([config.body, config.color, config.eyes]).toEqual(["blob", "teal", "dot"]);
    }
  });
});

describe("agentAvatarLook", () => {
  const readable = (config: ReturnType<typeof agentAvatarLook>) => {
    const eye = resolvePalette(config).eye;
    return Math.min(...eyeSurfaceColors(config).map((surface) => contrast(eye, surface))) >= 3;
  };

  test("without choices it is the generated look, always in a preset colour", () => {
    for (const seed of seeds.slice(0, 100)) {
      const look = agentAvatarLook(seed);
      expect(BODY_COLOR_NAMES.some((name) => name === look.color)).toBe(true);
      expect(look).toEqual(agentAvatarLook(seed));
    }
  });

  test("applies the owner's body and colour and keeps the eyes readable", () => {
    for (const seed of seeds.slice(0, 20)) {
      for (const body of BODIES) {
        for (const color of BODY_COLOR_NAMES) {
          const look = agentAvatarLook(seed, { body, color });
          expect([look.body, look.color, readable(look)]).toEqual([body, color, true]);
        }
      }
    }
  });
});
