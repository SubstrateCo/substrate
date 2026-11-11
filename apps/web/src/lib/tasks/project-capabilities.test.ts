import { projectCapabilities } from "./project-capabilities";
import { expect, test } from "bun:test";

test.each([
  [undefined, false, false, false],
  [null, false, false, false],
  ["view", false, false, false],
  ["comment", false, true, false],
  ["edit", true, true, false],
  ["owner", true, true, true],
] as const)("project capabilities for %s", (level, canEdit, canComment, canManage) => {
  expect(projectCapabilities(level)).toEqual({ canEdit, canComment, canManage });
});
