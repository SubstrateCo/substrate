import { electronQuery } from "../desktop/authorization-query";
import { authLink, authSearch, safeRedirect } from "./navigation";
import { describe, expect, test } from "bun:test";

describe("auth redirect policy", () => {
  test("starts standalone browser authentication in public setup without replacing an explicit destination", () => {
    expect(authSearch.parse({}).redirect).toBe("/onboarding");
    expect(authSearch.parse({ redirect: "https://evil.test" }).redirect).toBe("/onboarding");
    expect(authSearch.parse({ redirect: "/messages" }).redirect).toBe("/messages");
  });
  test("opens the page with fallbacks when a search value is malformed", () => {
    expect(authSearch.parse({ redirect: 42, email: ["a"], state: {} })).toEqual({
      redirect: "/onboarding",
      email: "",
      token: "",
      error: "",
    });
  });
  test("preserves only complete Electron authorization parameters across auth navigation", () => {
    const search = authSearch.parse({
      client_id: "electron",
      state: "state-1",
      code_challenge: "challenge-1",
      cookie: "secret",
    });
    expect(
      authLink("/signup", "/accept-invitation/invite-1", undefined, electronQuery(search)).search,
    ).toEqual({
      redirect: "/accept-invitation/invite-1",
      client_id: "electron",
      state: "state-1",
      code_challenge: "challenge-1",
    });
    expect(
      electronQuery(authSearch.parse({ client_id: "other", state: "s", code_challenge: "c" })),
    ).toBeUndefined();
    expect(electronQuery(authSearch.parse({ client_id: "electron", state: "s" }))).toBeUndefined();
  });
  test("keeps an invitation through every auth link", () => {
    const invitation = "/accept-invitation/invite-123";
    const signup = authLink("/signup", invitation).search;
    const verification = authLink(
      "/verify-email",
      authSearch.parse(signup).redirect,
      "team@example.com",
    ).search;
    const login = authLink("/login", authSearch.parse(verification).redirect).search;
    expect(authSearch.parse(login).redirect).toBe(invitation);
    expect(authSearch.parse(verification).email).toBe("team@example.com");
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
      expect(safeRedirect(destination)).toBe("/messages");
    }
  });
  test("retains internal query strings", () => {
    expect(safeRedirect("/organizations?from=invitation#choose")).toBe(
      "/organizations?from=invitation#choose",
    );
  });
});
