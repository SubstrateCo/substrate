import { expect, test } from "bun:test";
import { testDatabaseURL } from "./environment";

test("test database setup requires a dedicated test URL", () => {
  expect(() => testDatabaseURL({})).toThrow("TEST_DATABASE_URL is required");
  expect(() => testDatabaseURL({ TEST_DATABASE_URL: "postgres://localhost/workspace" })).toThrow(
    "must end in _test",
  );
  const url = "postgres://localhost/workspace_test";
  expect(() => testDatabaseURL({ TEST_DATABASE_URL: url, DATABASE_URL: url })).toThrow(
    "must not use DATABASE_URL",
  );
  expect(testDatabaseURL({ TEST_DATABASE_URL: url }).pathname).toBe("/workspace_test");
});
