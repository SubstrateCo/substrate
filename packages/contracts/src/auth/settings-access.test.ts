import { organizationSettingsAccess } from "./settings-access";
import { describe, expect, test } from "bun:test";

describe("organization settings access", () => {
  test("owners can open settings and manage invitations", () => {
    expect(organizationSettingsAccess("owner")).toEqual({ allowed: true, isOwner: true });
  });

  test("admins can open settings but cannot manage invitations", () => {
    expect(organizationSettingsAccess("admin")).toEqual({ allowed: true, isOwner: false });
  });

  test("multiple roles retain owner access", () => {
    expect(organizationSettingsAccess("member,owner")).toEqual({ allowed: true, isOwner: true });
  });

  test("members, absent memberships, and unrelated roles are denied", () => {
    for (const role of ["member", undefined, "", "superadmin", "organization-owner"]) {
      expect(organizationSettingsAccess(role)).toEqual({ allowed: false, isOwner: false });
    }
  });
});
