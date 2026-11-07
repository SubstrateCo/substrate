import { referencePrefix, referenceQuery } from "./reference-query";
import { describe, expect, test } from "bun:test";

describe("reference query", () => {
  test("finds an unscoped query at the caret, not just the end of the message", () => {
    expect(referenceQuery("Review @alex before launch", 12)).toEqual({
      start: 7,
      end: 12,
      kind: "all",
      query: "alex",
    });
  });

  test.each([
    ["@", "all", ""],
    ["@user:alex", "person", "alex"],
    ["@task:onboarding", "task", "onboarding"],
    ["@PROJECT:launch", "project", "launch"],
    ["@projects:", "project", ""],
    ["@PROJECTS:launch", "project", "launch"],
    ["@tasks:onboarding", "task", "onboarding"],
    ["@users:alex", "person", "alex"],
  ] as const)("parses %s", (draft, kind, query) => {
    expect(referenceQuery(draft, draft.length)).toEqual({
      start: 0,
      end: draft.length,
      kind,
      query,
    });
  });

  test.each(["alex@example.com", "@[task:123]", "hello @alex ", "@@"])(
    "does not open for %s",
    (draft) => expect(referenceQuery(draft, draft.length)).toBeNull(),
  );

  test("uses user-facing user syntax without changing person reference identity", () => {
    expect(referencePrefix("person")).toBe("@user:");
    expect(referencePrefix("all")).toBe("@");
  });
});
