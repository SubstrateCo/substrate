import { POLICY_VERSION, runtimePolicy } from "./policy.ts";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

test("the policy text changes only together with POLICY_VERSION", () => {
  // After you change runtimePolicy, bump POLICY_VERSION and store the new version and hash here.
  expect({
    version: POLICY_VERSION,
    hash: createHash("sha256").update(runtimePolicy).digest("hex"),
  }).toEqual({
    version: 6,
    hash: "2be8fa7980538930fce4e0159be48c01b71184f72d374f8188e910f1fe82b4e2",
  });
});
