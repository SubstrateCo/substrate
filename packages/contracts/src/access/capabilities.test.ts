import { crmRecordCapabilities, projectCapabilities } from "./capabilities";
import { expect, test } from "bun:test";

test.each([
  [undefined, false, false, false],
  ["view", false, false, false],
  ["comment", false, false, false],
  ["edit", true, false, false],
  ["owner", true, true, true],
] as const)("an active project for %s", (level, canEdit, canManageAccess, canArchive) => {
  expect(projectCapabilities({ level, archived: false })).toEqual({
    canEdit,
    canManageAccess,
    canArchive,
  });
});

test.each(["view", "comment", "edit", "owner"] as const)(
  "an archived project is read-only for %s; only owners may restore or delete it",
  (level) => {
    expect(projectCapabilities({ level, archived: true })).toEqual({
      canEdit: false,
      canManageAccess: false,
      canArchive: level === "owner",
    });
  },
);

test.each([
  ["view", false, false, false],
  ["comment", false, false, false],
  ["edit", true, false, true],
  ["owner", true, true, true],
] as const)("an active CRM record for %s", (level, canEdit, canManageAccess, canArchive) => {
  expect(crmRecordCapabilities({ level, archived: false })).toEqual({
    canEdit,
    canManageAccess,
    canReassign: canEdit,
    canArchive,
  });
});

test("an archived CRM record takes no edits, sharing, or reassignment; editors may restore it", () => {
  expect(crmRecordCapabilities({ level: "owner", archived: true })).toEqual({
    canEdit: false,
    canManageAccess: false,
    canReassign: false,
    canArchive: true,
  });
  expect(crmRecordCapabilities({ level: "view", archived: true }).canArchive).toBe(false);
});
