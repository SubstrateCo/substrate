import { authHref, authSearch, safeRedirect } from "./auth-navigation";
import { describe, expect, test } from "bun:test";

describe("auth redirect policy", () => {
  test("preserves only complete Electron authorization parameters across auth navigation", () => {
    const search = "?client_id=electron&state=state-1&code_challenge=challenge-1&cookie=secret";
    const link = new URL(
      authHref("/signup", "/accept-invitation/invite-1", undefined, search),
      "https://app.test",
    );
    expect(Object.fromEntries(link.searchParams)).toEqual({
      redirect: "/accept-invitation/invite-1",
      client_id: "electron",
      state: "state-1",
      code_challenge: "challenge-1",
    });
    expect(
      new URL(
        authHref(
          "/login",
          "/dashboard",
          undefined,
          "?client_id=other&state=state&code_challenge=challenge",
        ),
        "https://app.test",
      ).searchParams.has("state"),
    ).toBe(false);
    expect(
      new URL(
        authHref("/login", "/dashboard", undefined, "?client_id=electron&state=state"),
        "https://app.test",
      ).searchParams.has("state"),
    ).toBe(false);
  });
  test("keeps an invitation through every auth link", () => {
    const invitation = "/accept-invitation/invite-123";
    const signup = new URL(authHref("/signup", invitation), "https://app.test");
    const verification = new URL(
      authHref(
        "/verify-email",
        authSearch(Object.fromEntries(signup.searchParams)).redirect,
        "team@example.com",
      ),
      "https://app.test",
    );
    const login = new URL(
      authHref("/login", authSearch(Object.fromEntries(verification.searchParams)).redirect),
      "https://app.test",
    );
    expect(authSearch(Object.fromEntries(login.searchParams)).redirect).toBe(invitation);
    expect(verification.searchParams.get("email")).toBe("team@example.com");
  });
  test("rejects external, ambiguous, and API destinations", () => {
    for (const destination of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/%2f%2fevil.test",
      "/%5cevil.test",
      "/%0aevil.test",
      "/.//evil.test",
      "/a/..//evil.test",
      "/%2e//evil.test",
      "/api/auth/sign-out",
      "/%zz",
      null,
    ]) {
      expect(safeRedirect(destination)).toBe("/dashboard");
    }
  });
  test("retains internal query strings", () => {
    expect(safeRedirect("/organizations?from=invitation#choose")).toBe(
      "/organizations?from=invitation#choose",
    );
  });
});
