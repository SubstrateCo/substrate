import { seededRandom } from "../config/generate.ts";
import { MOODS, WORLDS } from "../config/presets.ts";
import { isSubtle, pickAmbient } from "./choreography.ts";
import { describe, expect, test } from "bun:test";

describe("pickAmbient", () => {
  test("subtle keeps the small actions and never picks a spin or a flight", () => {
    const random = seededRandom(7);
    const picks = MOODS.flatMap((mood) =>
      WORLDS.flatMap((world) =>
        Array.from({ length: 50 }, () => pickAmbient(mood, world, "subtle", random)),
      ),
    ).filter((pick) => pick !== null);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every(isSubtle)).toBe(true);
  });

  test("off never picks anything", () => {
    const random = seededRandom(7);
    for (const mood of MOODS) {
      expect(pickAmbient(mood, "space", "off", random)).toBeNull();
    }
  });
});
