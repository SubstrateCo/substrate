import { projectCapabilities } from "./project-capabilities";
import { expect, test } from "bun:test";

test.each([
  [undefined, false, false, false, false],
  [null, false, false, false, false],
  ["view", false, false, false, false],
  ["comment", false, true, false, false],
  ["edit", true, true, false, false],
  ["owner", true, true, true, true],
] as const)("project capabilities for %s", (level, canEdit, canComment, canManage, canArchive) => {
  expect(projectCapabilities(level)).toEqual({ canEdit, canComment, canManage, canArchive });
});

test.each(["view", "comment", "edit", "owner"] as const)(
  "an archived project is read-only for %s; only owners may restore or delete it",
  (level) => {
    expect(projectCapabilities(level, true)).toEqual({
      canEdit: false,
      canComment: false,
      canManage: false,
      canArchive: level === "owner",
    });
  },
);
