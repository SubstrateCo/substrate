import { contrast } from "../color/color.ts";
import { decodeAvatarCode, encodeAvatarCode, withAvatarChoices } from "./code.ts";
import { agentAvatarLook, generateAvatarCode } from "./generate.ts";
import { BODIES, BODY_COLOR_NAMES, EYE_COLOR_NAMES, EYE_STYLES, FILLS } from "./presets.ts";
import { eyeSurfaceColors, resolvePalette, type AvatarConfig } from "./resolve.ts";
import { describe, expect, test } from "bun:test";

const readable = (config: AvatarConfig) => {
  const eye = resolvePalette(config).eye;
  return eyeSurfaceColors(config).every((surface) => contrast(eye, surface) >= 3);
};

describe("avatar codes", () => {
  test("stored codes keep their meaning: preset lists only ever grow at the end", () => {
    // Changing an existing position here changes every stored avatar. Append instead.
    expect(BODIES.slice(0, 6)).toEqual(["circle", "squircle", "pill", "blob", "drop", "hexagon"]);
    expect(BODY_COLOR_NAMES.slice(0, 11)).toEqual([
      "slate",
      "ink",
      "ocean",
      "teal",
      "moss",
      "lemon",
      "sunset",
      "rose",
      "plum",
      "clay",
      "cloud",
    ]);
    expect(FILLS.slice(0, 2)).toEqual(["gradient", "solid"]);
    expect(EYE_STYLES.slice(0, 6)).toEqual(["round", "tall", "wide", "dot", "square", "curious"]);
    expect(EYE_COLOR_NAMES.slice(0, 6)).toEqual(["white", "cream", "mint", "sky", "amber", "ink"]);
  });

  test("every preset look survives a round trip", () => {
    for (const body of BODIES) {
      for (const color of BODY_COLOR_NAMES) {
        for (const fill of FILLS) {
          for (const eyes of EYE_STYLES) {
            for (const eyeColor of EYE_COLOR_NAMES) {
              const look = { body, color, fill, eyes, eyeColor };
              const code = encodeAvatarCode(look);
              expect(code).toHaveLength(6);
              expect(decodeAvatarCode(code)).toEqual(look);
            }
          }
        }
      }
    }
  });

  test("rejects malformed codes and unknown presets", () => {
    for (const code of [
      "",
      "100000x",
      "200000",
      "1z0000",
      "10z000",
      "1000z0",
      "10000z",
      "1A0000",
    ]) {
      expect(decodeAvatarCode(code)).toBeNull();
    }
  });

  test("a custom hex colour cannot be stored", () => {
    const look = {
      body: "circle",
      color: "#123456",
      fill: "gradient",
      eyes: "round",
      eyeColor: "white",
    } as const;
    expect(() => encodeAvatarCode(look)).toThrow();
  });

  test("a new agent's code is its generated look", () => {
    for (const seed of ["agent-1", "agent-2", "8c0f2f8e-4a52-4a8e-9a39-3c1b0f7d2a11"]) {
      expect(decodeAvatarCode(generateAvatarCode(seed))).toEqual(agentAvatarLook(seed));
    }
  });
});

describe("withAvatarChoices", () => {
  test("applies the body and colour, keeps the rest, and keeps the eyes readable", () => {
    const start = generateAvatarCode("agent-1");
    const before = decodeAvatarCode(start);
    for (const body of BODIES) {
      for (const color of BODY_COLOR_NAMES) {
        const after = decodeAvatarCode(withAvatarChoices(start, { body, color }) ?? "");
        expect(after).toMatchObject({ body, color, fill: before?.fill, eyes: before?.eyes });
        expect(after && readable(after)).toBe(true);
      }
    }
  });

  test("gives the same code on every call", () => {
    const start = generateAvatarCode("agent-2");
    expect(withAvatarChoices(start, { color: "lemon" })).toBe(
      withAvatarChoices(start, { color: "lemon" }),
    );
  });

  test("returns null for a malformed code", () => {
    expect(withAvatarChoices("nope", { body: "blob" })).toBeNull();
  });
});
