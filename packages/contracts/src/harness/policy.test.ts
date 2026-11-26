import { POLICY_VERSION, runtimePolicy } from "./policy.ts";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

test("the policy text changes only together with POLICY_VERSION", () => {
  // After you change runtimePolicy, bump POLICY_VERSION and store the new version and hash here.
  expect({
    version: POLICY_VERSION,
    hash: createHash("sha256").update(runtimePolicy).digest("hex"),
  }).toEqual({
    version: 11,
    hash: "0709bb1952a5bd552489b533b95c55d24607d0ca9f1b5e30128d90c010822615",
  });
});
