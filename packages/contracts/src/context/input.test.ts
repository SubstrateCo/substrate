import { contextSearch } from "./input.ts";
import { expect, test } from "bun:test";

const search = { organizationId: "org", query: "" };

test("a combined search names each kind once", () => {
  expect(contextSearch.safeParse({ ...search, kinds: ["person", "task"] }).success).toBe(true);
  expect(contextSearch.safeParse({ ...search, kinds: ["task", "task"] }).success).toBe(false);
});

test("a combined search has no single kind or cursor", () => {
  expect(contextSearch.safeParse({ ...search, kinds: ["task"], kind: "task" }).success).toBe(false);
  expect(
    contextSearch.safeParse({ ...search, kinds: ["task"], after: crypto.randomUUID() }).success,
  ).toBe(false);
  expect(
    contextSearch.safeParse({ ...search, kind: "task", after: crypto.randomUUID() }).success,
  ).toBe(true);
});
