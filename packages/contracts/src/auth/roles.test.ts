import { canShareInvitation, invitableRoles, primaryRole, roleLabel, storedRoles } from "./roles";
import { describe, expect, test } from "bun:test";

describe("organization roles", () => {
  test("stored lists keep known roles and the strongest one wins", () => {
    expect(storedRoles("member, admin,superadmin")).toEqual(["member", "admin"]);
    expect(storedRoles(null)).toEqual([]);
    expect(primaryRole("member, admin")).toBe("admin");
    expect(primaryRole("organization-owner")).toBe("member");
  });

  test("a stored role list is labeled by its strongest role", () => {
    expect(roleLabel("member,admin")).toBe("Admin");
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("unknown")).toBe("Member");
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
