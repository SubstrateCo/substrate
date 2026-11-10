import { memberActions, primaryRole, roleLabel } from "./member-policy";
import { describe, expect, test } from "bun:test";

const actions = (viewerRole: string, memberRole: string, self = false) =>
  memberActions({
    viewerRole,
    viewerUserId: "viewer",
    memberRole,
    memberUserId: self ? "viewer" : "other",
  });

describe("memberActions", () => {
  test("owners change roles and remove anyone else", () => {
    expect(actions("owner", "owner")).toEqual({ canChangeRole: true, canRemove: true });
    expect(actions("owner", "member")).toEqual({ canChangeRole: true, canRemove: true });
  });

  test("admins remove members and admins but not owners, and never change roles", () => {
    expect(actions("admin", "member")).toEqual({ canChangeRole: false, canRemove: true });
    expect(actions("admin", "admin")).toEqual({ canChangeRole: false, canRemove: true });
    expect(actions("admin", "owner")).toEqual({ canChangeRole: false, canRemove: false });
  });

  test("members manage nobody", () => {
    expect(actions("member", "member")).toEqual({ canChangeRole: false, canRemove: false });
  });

  test("nobody changes or removes themselves here", () => {
    expect(actions("owner", "owner", true)).toEqual({ canChangeRole: false, canRemove: false });
  });

  test("a multi-role viewer acts with their strongest role", () => {
    expect(actions("member,owner", "owner").canChangeRole).toBe(true);
    expect(actions("admin,member", "member,owner").canRemove).toBe(false);
  });
});

describe("roles", () => {
  test("picks the strongest stored role and labels it", () => {
    expect(primaryRole("member, admin")).toBe("admin");
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("unknown")).toBe("Member");
  });
});
