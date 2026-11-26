import { POLICY_VERSION, runtimePolicy } from "./policy.ts";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

test("the policy text changes only together with POLICY_VERSION", () => {
  // After you change runtimePolicy, bump POLICY_VERSION and store the new version and hash here.
  expect({
    version: POLICY_VERSION,
    hash: createHash("sha256").update(runtimePolicy).digest("hex"),
  }).toEqual({
    version: 12,
    hash: "cbc53b5d500bd2d26276be1d3ab79562ae7cfce4fa8d0b48478b5eca24fc2fe1",
  });
});
