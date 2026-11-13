import { baselinePaths } from "./run-paths";
import { expect, test } from "bun:test";

test("baseline artifact paths do not retain URL directory separators", () => {
  const paths = baselinePaths(new URL("./run.ts", import.meta.url).href, "baseline-test");
  for (const value of Object.values(paths)) {
    expect(value).not.toMatch(/[\\/]$/);
    expect(value).not.toContain("\\/");
  }
  expect(`${paths.data}/users.json`).not.toContain("\\/");
  expect(paths.directory).toEndWith("baseline-test");
});
