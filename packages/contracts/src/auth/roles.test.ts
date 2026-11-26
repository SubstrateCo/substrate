import { canShareInvitation, invitableRoles, primaryRole, storedRoles } from "./roles";
import { describe, expect, test } from "bun:test";

describe("organization roles", () => {
  test("stored lists keep known roles and the strongest one wins", () => {
    expect(storedRoles("member, admin,superadmin")).toEqual(["member", "admin"]);
    expect(storedRoles(null)).toEqual([]);
    expect(primaryRole("member, admin")).toBe("admin");
    expect(primaryRole("organization-owner")).toBe("member");
  });

  test("only owners invite owners, and members invite nobody", () => {
    expect(invitableRoles("member,owner")).toEqual(["owner", "admin", "member"]);
    expect(invitableRoles("admin")).toEqual(["admin", "member"]);
    expect(invitableRoles("member")).toEqual([]);
  });

  test("an invitation link is shared only by people who could send that invitation", () => {
    expect(canShareInvitation("owner", "owner")).toBe(true);
    expect(canShareInvitation("admin", "member")).toBe(true);
    expect(canShareInvitation("admin", "member,owner")).toBe(false);
    expect(canShareInvitation("member", "member")).toBe(false);
  });
});
