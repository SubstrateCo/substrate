import { describe, expect, test } from "bun:test";
import { organizationResult, rememberedOrganization } from "./organization-policy";
import { roles } from "./permissions";

describe("organization policy", () => {
  test("only owners can send or cancel invitations", () => {
    for (const role of [roles.admin, roles.member]) {
      expect(role.authorize({ invitation: ["create"] }).success).toBe(false);
      expect(role.authorize({ invitation: ["cancel"] }).success).toBe(false);
      expect(role.authorize({ member: ["create"] }).success).toBe(false);
      expect(role.authorize({ member: ["update"] }).success).toBe(false);
    }
    expect(roles.owner.authorize({ invitation: ["create", "cancel"] }).success).toBe(true);
  });

  test("only remembers successful organization changes", () => {
    expect(rememberedOrganization("/organization/set-active", {}, { id: "chosen" })).toBe("chosen");
    expect(rememberedOrganization("/organization/set-active", {}, null)).toBe(null);
    expect(rememberedOrganization("/organization/create", {}, { id: "new" })).toBe("new");
    expect(
      rememberedOrganization(
        "/organization/create",
        { keepCurrentActiveOrganization: true },
        { id: "new" },
      ),
    ).toBeUndefined();
    expect(
      rememberedOrganization(
        "/organization/accept-invitation",
        {},
        { member: { organizationId: "joined" } },
      ),
    ).toBe("joined");
    expect(
      rememberedOrganization(
        "/organization/set-active",
        {},
        organizationResult.parse({ code: "FORBIDDEN" }),
      ),
    ).toBeUndefined();
    expect(rememberedOrganization("/sign-out", {}, null)).toBeUndefined();
  });
});
