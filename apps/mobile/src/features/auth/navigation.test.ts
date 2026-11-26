import { authDestination, authModeForPath, authRouteFromUrl } from "./navigation";
import { describe, expect, test } from "bun:test";

describe("mobile auth links", () => {
  test("keeps reset credentials and a permitted continuation", () => {
    expect(
      authRouteFromUrl(
        "substrate-mobile://reset-password?token=real-token&destination=%2Faccept-invitation%2Finvite-1",
      ),
    ).toBe("/reset-password?token=real-token&destination=%2Faccept-invitation%2Finvite-1");
  });

  test("accepts invitation links and drops unrecognized parameters", () => {
    expect(authRouteFromUrl("substrate-mobile://accept-invitation/invite_1?admin=true")).toBe(
      "/accept-invitation/invite_1",
    );
  });

  test("requires an explicit origin for web callbacks", () => {
    expect(authRouteFromUrl("https://other.example/reset-password?token=secret")).toBeNull();
    expect(
      authRouteFromUrl("https://app.example/verify-email?token=secret", "https://app.example"),
    ).toBe("/verify-email?token=secret");
    expect(
      authRouteFromUrl("https://other.example/verify-email", "https://app.example"),
    ).toBeNull();
  });

  test("rejects other schemes, unknown routes, credentials, and malformed invitation IDs", () => {
    for (const value of [
      "javascript:alert(1)",
      "substrate-mobile://settings",
      "//other.example/login",
      "substrate-mobile://user:password@login",
      "/accept-invitation/a%2Fb",
      "/login?invitationId=a%2Fb",
      "/login?token=%00",
    ])
      expect(authRouteFromUrl(value)).toBeNull();
  });

  test("never continues to an external or arbitrary local destination", () => {
    for (const value of [
      "https://other.example",
      "//other.example",
      "/\\other.example",
      "/settings",
      "/login",
      "/%2fother.example",
    ]) {
      expect(authDestination(value)).toBeUndefined();
    }
    expect(authRouteFromUrl("/login?destination=https%3A%2F%2Fother.example")).toBe("/login");
  });

  test("maps only known auth screens", () => {
    expect(authModeForPath("/verify-email")).toBe("verify");
    expect(authModeForPath("/reset-password")).toBe("reset");
    expect(authModeForPath("/unknown")).toBeNull();
  });

  test("does not expose identity signup on mobile", () => {
    expect(authModeForPath("/signup")).toBeNull();
    expect(authRouteFromUrl("/signup")).toBeNull();
    expect(authRouteFromUrl("substrate-mobile://signup")).toBeNull();
  });
});
