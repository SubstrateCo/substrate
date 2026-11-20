import { roles } from "@substrate/contracts/auth/permissions";

import {
  organizationResult,
  rememberedOrganization,
  rethrowInvitationLookupError,
} from "./organization-policy";
import { APIError } from "better-auth/api";
import { describe, expect, test } from "bun:test";

describe("organization policy", () => {
  test("invitation lookup failures expose a stable code without changing legacy status or copy", () => {
    const error = new APIError("BAD_REQUEST", { message: "Invitation not found!" });
    expect(() => rethrowInvitationLookupError("/organization/get-invitation", error)).toThrow(
      expect.objectContaining({
        statusCode: 400,
        body: { code: "INVITATION_NOT_FOUND", message: "Invitation not found!" },
      }),
    );
  });

  test("invitation error normalization leaves other paths and results alone", () => {
    const missing = new APIError("BAD_REQUEST", { message: "Invitation not found!" });
    expect(
      rethrowInvitationLookupError("/organization/accept-invitation", missing),
    ).toBeUndefined();
    for (const result of [
      new APIError("FORBIDDEN", { message: "Invitation not found!" }),
      new APIError("BAD_REQUEST", { message: "Invalid request input." }),
      new APIError("BAD_REQUEST", {
        code: "EXISTING_CODE",
        message: "Invitation not found!",
      }),
    ]) {
      expect(rethrowInvitationLookupError("/organization/get-invitation", result)).toBeUndefined();
    }
  });

  test("only owners and admins can send or cancel invitations", () => {
    for (const role of [roles.admin, roles.member]) {
      expect(role.authorize({ member: ["create"] }).success).toBe(false);
      expect(role.authorize({ member: ["update"] }).success).toBe(false);
    }
    expect(roles.member.authorize({ invitation: ["create"] }).success).toBe(false);
    expect(roles.member.authorize({ invitation: ["cancel"] }).success).toBe(false);
    for (const role of [roles.owner, roles.admin])
      expect(role.authorize({ invitation: ["create", "cancel"] }).success).toBe(true);
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
