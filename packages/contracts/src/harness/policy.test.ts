import { POLICY_VERSION, runtimePolicy } from "./policy.ts";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

test("the policy text changes only together with POLICY_VERSION", () => {
  // After you change runtimePolicy, bump POLICY_VERSION and store the new version and hash here.
  expect({
    version: POLICY_VERSION,
    hash: createHash("sha256").update(runtimePolicy).digest("hex"),
  }).toEqual({
    version: 10,
    hash: "90d80c099b7a773ca0f69333de05cadd57be0d867701f9f0efc12cfc07be5c7b",
  });
});
