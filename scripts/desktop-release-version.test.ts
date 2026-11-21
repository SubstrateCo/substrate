import { nextDesktopVersion, parseReleaseBump, type ReleaseBump } from "./desktop-release-version";
import { describe, expect, test } from "bun:test";

describe("nextDesktopVersion", () => {
  const cases: [string, ReleaseBump, string][] = [
    ["0.1.0", "patch", "0.1.1"],
    ["0.2.3", "minor", "0.3.0"],
    ["0.2.3", "major", "1.0.0"],
    ["1.9.9", "patch", "1.9.10"],
    ["1.9.9", "minor", "1.10.0"],
    ["1.9.9", "major", "2.0.0"],
  ];
  test.each(cases)("bumps %s with %s to %s", (current, bump, expected) => {
    expect(nextDesktopVersion(current, bump)).toBe(expected);
  });

  test.each(["v1.2.3", "01.2.3", "1.2", "1.2.3-beta.1", "1.2.3\n", "-1.2.3"])(
    "rejects an invalid current version: %s",
    (current) => {
      expect(() => nextDesktopVersion(current, "patch")).toThrow("stable app version");
    },
  );

  test("rejects an unknown bump", () => {
    expect(() => parseReleaseBump("automatic")).toThrow("Unknown release bump");
  });

  test("rejects overflow", () => {
    expect(() => nextDesktopVersion("9007199254740991.0.0", "major")).toThrow("safe integer");
  });
});
