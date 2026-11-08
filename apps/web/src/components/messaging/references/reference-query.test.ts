import { referencePrefix, referenceQuery } from "./reference-query";
import { describe, expect, test } from "bun:test";

describe("reference query", () => {
  test("finds an unscoped query at the caret, not just the end of the message", () => {
    expect(referenceQuery("Review @alex before launch", 12)).toEqual({
      start: 7,
      end: 12,
      trigger: "@",
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
      trigger: "@",
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

  test.each([
    ["#", "channel", ""],
    ["#prod", "channel", "prod"],
    ["#channels:prod", "channel", "prod"],
    ["#thread:launch", "thread", "launch"],
  ] as const)("parses %s as a messaging reference", (draft, kind, query) => {
    expect(referenceQuery(draft, draft.length)).toEqual({
      start: 0,
      end: draft.length,
      trigger: "#",
      kind,
      query,
    });
  });

  test.each(["word#prod", "##", "# heading", "`#prod", "```\n#prod", "\\#prod"])(
    "does not open a hashtag picker for %s",
    (draft) => expect(referenceQuery(draft, draft.length)).toBeNull(),
  );

  test("uses hashtag prefixes for channels and threads", () => {
    expect(referencePrefix("channel")).toBe("#channel:");
    expect(referencePrefix("thread")).toBe("#thread:");
  });
});
