import { describe, expect, test } from "bun:test";
import { guestSessionRedirect, verifiedSessionAccess } from "./session-policy";
import type { getSession } from "@/server/session";

const session: NonNullable<Awaited<ReturnType<typeof getSession>>> = {
  user: {
    id: "user-1",
    name: "Test User",
    email: "team@example.com",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: "session-1",
    token: "session-token",
    userId: "user-1",
    expiresAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: null,
    userAgent: null,
    activeOrganizationId: null,
  },
};

describe("verified route session policy", () => {
  test("sends guests to login with their full destination", () => {
    expect(verifiedSessionAccess(null, "/accept-invitation/invite-123?source=email")).toEqual({
      redirect: "/login?redirect=%2Faccept-invitation%2Finvite-123%3Fsource%3Demail",
    });
  });

  test("sends unverified users to verification with email and destination", () => {
    expect(
      verifiedSessionAccess(
        {
          ...session,
          user: { ...session.user, emailVerified: false },
        },
        "/organizations",
      ),
    ).toEqual({
      redirect: "/verify-email?redirect=%2Forganizations&email=team%40example.com",
    });
  });

  test("allows verified users without an active organization", () => {
    expect(verifiedSessionAccess(session, "/organizations")).toEqual({ session });
  });
});

describe("guest route session policy", () => {
  test("allows signed-out visitors", () => {
    expect(guestSessionRedirect(null, "/dashboard")).toBeNull();
  });

  test("redirects restored verified sessions without an organization to selection", () => {
    expect(guestSessionRedirect(session, "/dashboard")).toBe("/organizations");
  });

  test("redirects restored verified workspace sessions to dashboard", () => {
    expect(
      guestSessionRedirect(
        {
          ...session,
          session: { ...session.session, activeOrganizationId: "organization-1" },
        },
        "/dashboard",
      ),
    ).toBe("/dashboard");
  });

  test("honors an invitation destination", () => {
    expect(guestSessionRedirect(session, "/accept-invitation/invite-123?source=email")).toBe(
      "/accept-invitation/invite-123?source=email",
    );
  });

  test("rejects unsafe destinations and guest-page redirect loops", () => {
    for (const destination of [
      "https://evil.test",
      "/login?redirect=%2Fsignup",
      "/signup",
      "/LOGIN/",
      "/%6cogin",
    ]) {
      expect(guestSessionRedirect(session, destination)).toBe("/organizations");
    }
  });

  test("redirects unverified sessions to verification with the requested destination", () => {
    expect(
      guestSessionRedirect(
        {
          ...session,
          user: { ...session.user, emailVerified: false },
        },
        "/accept-invitation/invite-123",
      ),
    ).toBe("/verify-email?redirect=%2Faccept-invitation%2Finvite-123&email=team%40example.com");
  });
});
