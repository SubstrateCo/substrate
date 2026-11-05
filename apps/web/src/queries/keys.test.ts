import { expect, test } from "bun:test";
import { queryKeys } from "./keys";

test("organization caches are scoped and share an invalidation prefix", () => {
  expect(queryKeys.invitations("alpha")).not.toEqual(queryKeys.invitations("beta"));
  expect(queryKeys.organizationDetail("alpha").slice(0, 2)).toEqual([
    ...queryKeys.organization("alpha"),
  ]);
  expect(queryKeys.activeMember("beta").slice(0, 2)).toEqual([...queryKeys.organization("beta")]);
});
