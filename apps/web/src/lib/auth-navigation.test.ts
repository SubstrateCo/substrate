import { describe, expect, test } from "bun:test";
import { authHref, authSearch, safeRedirect } from "./auth-navigation";

describe("auth redirect policy", () => {
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
