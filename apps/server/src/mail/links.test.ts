import { frontendAuthLink, invitationLink } from "./links";
import { describe, expect, test } from "bun:test";

describe("browser auth email links", () => {
  test("keeps verification credentials in the browser flow and preserves the desktop authorization query", () => {
    const callback = "/login?client_id=electron&state=state&code_challenge=challenge";
    const link = new URL(
      frontendAuthLink(
        `https://api.example.com/api/auth/verify-email?token=verification-token&callbackURL=${encodeURIComponent(callback)}`,
        "https://app.example.com",
      ),
    );
    expect(link.origin).toBe("https://app.example.com");
    expect(link.pathname).toBe("/api/auth/verify-email");
    expect(link.searchParams.get("token")).toBe("verification-token");
    expect(link.searchParams.get("callbackURL")).toBe(`https://app.example.com${callback}`);
  });

  test("anchors relative reset callbacks to the frontend rather than the API", () => {
    const link = new URL(
      frontendAuthLink(
        "https://api.example.com/api/auth/reset-password/reset-token?callbackURL=%2Freset-password%3Fredirect%3D%252Faccept-invitation%252Finvite-1",
        "https://app.example.com",
      ),
    );
    expect(link.pathname).toBe("/api/auth/reset-password/reset-token");
    expect(link.searchParams.get("callbackURL")).toBe(
      "https://app.example.com/reset-password?redirect=%2Faccept-invitation%2Finvite-1",
    );
  });

  test("does not add missing callbacks", () => {
    const link = new URL(
      frontendAuthLink(
        "https://api.example.com/api/auth/verify-email?token=token",
        "https://app.example.com",
      ),
    );
    expect(link.searchParams.has("callbackURL")).toBe(false);
  });
});

test("desktop workspace invitations still use the public handoff without forwarding credentials", () => {
  const options = {
    baseURL: "https://api.example.com",
    request: new Request("https://api.example.com", {
      headers: { Origin: "https://desktop.substrate.local" },
    }),
  };
  const link = new URL(invitationLink("invite-1", "https://app.example.com", options));
  expect(link.origin).toBe(options.baseURL);
  expect(link.pathname).toBe("/desktop/open");
  expect(link.searchParams.get("path")).toBe("/accept-invitation/invite-1");
  expect(invitationLink("invite-1", "https://app.example.com", { baseURL: options.baseURL })).toBe(
    "https://app.example.com/accept-invitation/invite-1",
  );
});
