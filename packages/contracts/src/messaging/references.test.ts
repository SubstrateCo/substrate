import { attachedWork, referenceQuery } from "./references";
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
    ["@agent:helper", "agent", "helper"],
    ["@AGENTS:", "agent", ""],
  ] as const)("parses %s", (draft, kind, query) => {
    expect(referenceQuery(draft, draft.length)).toEqual({
      start: 0,
      end: draft.length,
      trigger: "@",
      kind,
      query,
    });
  });

  test.each([
    ["@Alex Smith", "all", "Alex Smith"],
    ["@task:Launch plan", "task", "Launch plan"],
    ["hello @alex ", "all", "alex"],
  ] as const)("keeps %s open across single spaces", (draft, kind, query) => {
    expect(referenceQuery(draft, draft.length)).toMatchObject({
      start: draft.indexOf("@"),
      end: draft.length,
      kind,
      query,
    });
  });

  test.each([
    "alex@example.com",
    "@[task:123]",
    "@@",
    "@ alex",
    "@alex  smith",
    "@one two three four five",
    "@alex\nsmith",
    "#prod is down",
  ])("does not open for %s", (draft) => expect(referenceQuery(draft, draft.length)).toBeNull());

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
});

describe("attached work", () => {
  const link = (entityId: string, purpose: string, canRemove = false) => ({
    entityId,
    purpose,
    canRemove,
  });

  test("mentions are not repeated under the message", () => {
    expect(attachedWork([link("a", "mention"), link("b", "association", true)])).toEqual([
      link("b", "association", true),
    ]);
  });

  test("a record linked for several reasons shows once, keeps its source, and stays removable", () => {
    expect(
      attachedWork([link("a", "source"), link("a", "mention"), link("a", "association", true)]),
    ).toEqual([link("a", "source", true)]);
  });
});
