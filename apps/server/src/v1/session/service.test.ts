import { createSessionService } from "./service";
import { sessionFixture } from "./test-support";
import { APIError } from "better-auth/api";
import { describe, expect, test } from "bun:test";

describe("session service", () => {
  test("returns the authenticated session using the incoming headers", async () => {
    const session = sessionFixture();
    const headers = new Headers({ cookie: "session=test" });
    let received: Headers | undefined;
    const service = createSessionService({
      getSession: async (input) => {
        received = input.headers;
        return session;
      },
    });
    const { token: _token, ...publicSession } = session.session;
    expect(await service.read(headers)).toEqual({
      success: true,
      data: { ...session, session: publicSession },
    });
    expect(received).toBe(headers);
  });

  test("returns null for an anonymous request", async () => {
    const service = createSessionService({ getSession: async () => null });
    expect(await service.read(new Headers())).toEqual({ success: true, data: null });
  });

  test("maps auth failures and hides unexpected error details", async () => {
    const denied = createSessionService({
      getSession: async () => {
        throw new APIError("UNAUTHORIZED");
      },
    });
    expect(await denied.read(new Headers())).toEqual({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
    });
    const broken = createSessionService({
      getSession: async () => {
        throw new Error("private database detail");
      },
    });
    expect(await broken.read(new Headers())).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "The operation is unavailable. Please try again." },
    });
  });
});
