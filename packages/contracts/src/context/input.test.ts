import { contextSearch } from "./input.ts";
import { expect, test } from "bun:test";

const search = { organizationId: "org", query: "" };

test("a search can combine several kinds, each once, with a limit per kind", () => {
  expect(contextSearch.parse({ ...search, kinds: ["person", "task"], limit: 5 })).toMatchObject({
    kinds: ["person", "task"],
    limit: 5,
  });
  expect(contextSearch.safeParse({ ...search, kinds: [] }).success).toBe(false);
  expect(contextSearch.safeParse({ ...search, kinds: ["task", "task"] }).success).toBe(false);
  for (const kind of ["all", "channel", "thread"])
    expect(contextSearch.safeParse({ ...search, kinds: [kind] }).success).toBe(false);
});

test("a combined search has no single kind or cursor", () => {
  expect(contextSearch.safeParse({ ...search, kinds: ["task"], kind: "task" }).success).toBe(false);
  expect(
    contextSearch.safeParse({ ...search, kinds: ["task"], after: crypto.randomUUID() }).success,
  ).toBe(false);
  // Existing single-kind requests stay valid.
  expect(
    contextSearch.safeParse({ ...search, kind: "task", after: crypto.randomUUID() }).success,
  ).toBe(true);
});
