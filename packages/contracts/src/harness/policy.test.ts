import { POLICY_VERSION, runtimePolicy } from "./policy.ts";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

test("the policy text changes only together with POLICY_VERSION", () => {
  // After you change runtimePolicy, bump POLICY_VERSION and store the new version and hash here.
  expect({
    version: POLICY_VERSION,
    hash: createHash("sha256").update(runtimePolicy).digest("hex"),
  }).toEqual({
    version: 3,
    hash: "fe63d4275231daa1422424d3ba1a86dc321fc1910c996de77da10fe541b7d237",
  });
});
