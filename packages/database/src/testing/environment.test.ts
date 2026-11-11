import { testDatabaseURL } from "./environment";
import { expect, test } from "bun:test";

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

test("a parallel test worker uses its own database", () => {
  const env = {
    TEST_DATABASE_URL: "postgres://localhost/workspace_test",
    TEST_DATABASE_WORKER_URLS: "postgres://localhost/first_test postgres://localhost/second_test",
  };
  expect(testDatabaseURL({ ...env, BUN_TEST_WORKER_ID: "2" }).pathname).toBe("/second_test");
  expect(() => testDatabaseURL({ ...env, BUN_TEST_WORKER_ID: "3" })).toThrow(
    "TEST_DATABASE_URL is required",
  );
  expect(testDatabaseURL(env).pathname).toBe("/workspace_test");
});

test("a parallel test worker without worker databases does not fall back to the shared database", () => {
  expect(() =>
    testDatabaseURL({
      TEST_DATABASE_URL: "postgres://localhost/workspace_test",
      BUN_TEST_WORKER_ID: "1",
    }),
  ).toThrow("Parallel test workers need their own databases");
});
