import { permissionLevels } from "../tasks/status";
import { atLeast, crmAccessLabels, permissionLabels } from "./levels";
import { expect, test } from "bun:test";

test("a level grants itself and every weaker level, and no level grants nothing", () => {
  expect(atLeast("comment", "view")).toBe(true);
  expect(atLeast("comment", "comment")).toBe(true);
  expect(atLeast("comment", "edit")).toBe(false);
  expect(atLeast(null, "view")).toBe(false);
});

test.each([permissionLabels, crmAccessLabels])("each level has its own label", (labels) => {
  expect(new Set(permissionLevels.map((level) => labels[level])).size).toBe(
    permissionLevels.length,
  );
});
