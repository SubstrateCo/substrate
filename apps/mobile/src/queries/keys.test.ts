import { queryKeys } from "./keys";
import { expect, test } from "bun:test";

test("private query keys isolate both account and workspace", () => {
  const key = queryKeys.detail({ userId: "one", organizationId: "team" }, "tasks", "task");
  expect(key).not.toEqual(
    queryKeys.detail({ userId: "two", organizationId: "team" }, "tasks", "task"),
  );
  expect(key).not.toEqual(
    queryKeys.detail({ userId: "one", organizationId: "other" }, "tasks", "task"),
  );
  expect(key.slice(0, 4)).toEqual([
    ...queryKeys.workspace({ userId: "one", organizationId: "team" }),
  ]);
});
