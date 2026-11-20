import { contextNotificationPage, contextTargets, contextSearch } from "./input.ts";
import { expect, test } from "bun:test";

const id = "00000000-0000-4000-8000-000000000001";

test("notification pages accept a UUID cursor, a known filter and a whole limit up to 20", () => {
  const page = { organizationId: "org" };
  expect(contextNotificationPage.parse({ ...page, after: id, filter: "unread" })).toEqual({
    ...page,
    after: id,
    filter: "unread",
    limit: 20,
  });
  for (const invalid of [
    { after: "invalid" },
    { filter: "invalid" },
    { limit: "0" },
    { limit: "21" },
    { limit: "1.5" },
  ])
    expect(contextNotificationPage.safeParse({ ...page, ...invalid }).success).toBe(false);
});

test("message targets need a conversation and a message UUID for each target", () => {
  const input = (targets: unknown[]) => ({ organizationId: "org", targets });
  expect(contextTargets.safeParse(input([{ conversationId: id, messageId: id }])).success).toBe(
    true,
  );
  expect(contextTargets.safeParse(input([{ messageId: id }])).success).toBe(false);
  expect(
    contextTargets.safeParse(input([{ conversationId: id, messageId: "not-a-uuid" }])).success,
  ).toBe(false);
});

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
