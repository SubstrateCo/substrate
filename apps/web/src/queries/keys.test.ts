import { queryKeys } from "./keys";
import { expect, test } from "bun:test";

test("message caches isolate workspace, conversation, and thread", () => {
  const key = queryKeys.messages("one", "conversation");
  expect(key).not.toEqual(queryKeys.messages("two", "conversation"));
  expect(key).not.toEqual(queryKeys.messages("one", "other"));
  expect(key).not.toEqual(queryKeys.messages("one", "conversation", "thread"));
  expect(key.slice(0, 3)).toEqual([...queryKeys.messaging("one")]);
});

test("organization caches are scoped and share an invalidation prefix", () => {
  expect(queryKeys.invitations("alpha")).not.toEqual(queryKeys.invitations("beta"));
  expect(queryKeys.organizationDetail("alpha").slice(0, 2)).toEqual([
    ...queryKeys.organization("alpha"),
  ]);
  expect(queryKeys.activeMember("beta").slice(0, 2)).toEqual([...queryKeys.organization("beta")]);
});
