import { serviceResult } from "../shared/service-result";
import { createSessionApi } from "./session-api";
import { APIError } from "better-auth/api";
import { describe, expect, test } from "bun:test";

describe("session api adapter", () => {
  test.each([
    ["BAD_REQUEST", "INVALID_INPUT", "Invalid request input."],
    ["UNAUTHORIZED", "UNAUTHENTICATED", "Sign in to continue."],
    ["FORBIDDEN", "FORBIDDEN", "Access denied."],
  ] as const)(
    "maps Better Auth %s APIError to %s without leaking details",
    async (status, code, message) => {
      const api = createSessionApi({
        getSession: async () => {
          throw new APIError(status, { message: "Private implementation details" });
        },
        getActiveMemberRole: async () => {
          throw new APIError(status, { message: "Private implementation details" });
        },
      });
      const sessionResult = await serviceResult(() =>
        api.getSession({ headers: new Headers(), query: { disableRefresh: true } }),
      );
      expect(sessionResult).toEqual({
        success: false,
        error: { code, message, userMessage: message },
      });
      const roleResult = await serviceResult(() =>
        api.getActiveMemberRole({ headers: new Headers(), query: { organizationId: "org" } }),
      );
      expect(roleResult).toEqual({
        success: false,
        error: { code, message, userMessage: message },
      });
    },
  );

  test("rethrows unexpected errors so serviceResult treats them as internal failures", async () => {
    const unexpected = new APIError("INTERNAL_SERVER_ERROR", { message: "Database secret" });
    const api = createSessionApi({
      getSession: async () => {
        throw unexpected;
      },
      getActiveMemberRole: async () => {
        throw unexpected;
      },
    });
    let caught: unknown;
    try {
      await api.getSession({ headers: new Headers(), query: { disableRefresh: true } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(unexpected);
  });
});
