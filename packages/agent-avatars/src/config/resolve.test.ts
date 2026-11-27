import { avatarConfigSchema, DEFAULT_CONFIG, resolvePalette } from "./resolve.ts";
import { describe, expect, test } from "bun:test";

describe("avatarConfigSchema", () => {
  test("replaces unknown or malformed values with the defaults", () => {
    expect(
      avatarConfigSchema.parse({
        body: "triangle",
        color: "#12345",
        fill: 3,
        eyes: null,
        eyeColor: "javascript:alert(1)",
        secondaryColor: "red",
      }),
    ).toEqual(DEFAULT_CONFIG);
  });

  test("keeps preset names and hex colours", () => {
    expect(
      avatarConfigSchema.parse({
        body: "drop",
        color: "#7c5cff",
        secondaryColor: "#123",
        fill: "solid",
        eyes: "wide",
        eyeColor: "mint",
      }),
    ).toEqual({
      body: "drop",
      color: "#7c5cff",
      secondaryColor: "#123",
      fill: "solid",
      eyes: "wide",
      eyeColor: "mint",
    });
  });
});

describe("resolvePalette", () => {
  test("a solid fill uses one colour for the whole body", () => {
    const palette = resolvePalette({ ...DEFAULT_CONFIG, color: "ocean", fill: "solid" });
    expect(palette.from).toBe(palette.to);
  });

  test("a custom gradient ends on the secondary colour", () => {
    const palette = resolvePalette({
      ...DEFAULT_CONFIG,
      color: "#ff8800",
      secondaryColor: "#220044",
    });
    expect(palette.to).toBe("#220044");
  });
});
