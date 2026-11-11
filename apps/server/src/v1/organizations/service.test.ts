import { sessionFixture } from "../session/test-support";
import { createOrganizationService } from "./service";
import { APIError } from "better-auth/api";
import { describe, expect, test } from "bun:test";

describe("organization settings access service", () => {
  test("requires a verified session and active workspace before membership lookup", async () => {
    for (const session of [
      null,
      sessionFixture({ emailVerified: false }),
      sessionFixture({ organizationId: null }),
    ]) {
      let checkedMembership = false;
      const service = createOrganizationService({
        getSession: async () => session,
        getActiveMemberRole: async () => {
          checkedMembership = true;
          return { role: "owner" };
        },
      });
      expect(await service.settingsAccess(new Headers())).toEqual({ success: true, data: null });
      expect(checkedMembership).toBe(false);
    }
  });

  test("checks membership in the session workspace and grants only owner or admin access", async () => {
    const headers = new Headers({ cookie: "session=test" });
    for (const [role, expected] of [
      ["owner", { organizationId: "organization-1", isOwner: true }],
      ["admin", { organizationId: "organization-1", isOwner: false }],
      ["member,owner", { organizationId: "organization-1", isOwner: true }],
      ["member", null],
      ["superowner", null],
      ["", null],
    ] as const) {
      let membershipInput: unknown;
      const service = createOrganizationService({
        getSession: async () => sessionFixture(),
        getActiveMemberRole: async (input) => {
          membershipInput = input;
          return { role };
        },
      });
      expect(await service.settingsAccess(headers)).toEqual({ success: true, data: expected });
      expect(membershipInput).toEqual({ headers, query: { organizationId: "organization-1" } });
    }
  });

  test("does not grant access when membership cannot be verified", async () => {
    const service = createOrganizationService({
      getSession: async () => sessionFixture(),
      getActiveMemberRole: async () => {
        throw new APIError("FORBIDDEN");
      },
    });
    expect(await service.settingsAccess(new Headers())).toEqual({
      success: false,
      error: { code: "FORBIDDEN", message: "Access denied.", userMessage: "Access denied." },
    });
  });

  test("contains failures from session lookup as well as membership lookup", async () => {
    const service = createOrganizationService({
      getSession: async () => {
        throw new Error("private storage error");
      },
      getActiveMemberRole: async () => ({ role: "owner" }),
    });
    expect(await service.settingsAccess(new Headers())).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "The operation is unavailable. Please try again." },
    });
  });
});
