import { POLICY_VERSION, runtimePolicy } from "./policy.ts";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

test("the policy text changes only together with POLICY_VERSION", () => {
  expect({
    version: POLICY_VERSION,
    hash: createHash("sha256").update(runtimePolicy).digest("hex"),
  }).toEqual({
    version: 20,
    hash: "40f3cbe700bb3eef9f3799f6375c7efca02e2675e99c060d093a42553559347f",
  });
});
