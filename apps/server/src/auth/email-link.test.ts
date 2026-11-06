import { describe, expect, test } from "bun:test";
import { frontendAuthLink, invitationLink } from "./email-link";

describe("frontend auth email links", () => {
  test("routes verification through the frontend proxy and keeps the token and callback", () => {
    const link = new URL(
      frontendAuthLink(
        "http://localhost:3001/api/auth/verify-email?token=verification-token&callbackURL=%2Flogin%3Fredirect%3D%252Ftasks",
        "http://localhost:3000",
      ),
    );
    expect(link.origin).toBe("http://localhost:3000");
    expect(link.pathname).toBe("/api/auth/verify-email");
    expect(link.searchParams.get("token")).toBe("verification-token");
    expect(link.searchParams.get("callbackURL")).toBe(
      "http://localhost:3000/login?redirect=%2Ftasks",
    );
  });

  test("anchors relative reset callbacks to the frontend rather than the API", () => {
    const link = new URL(
      frontendAuthLink(
        "https://api.example.com/api/auth/reset-password/reset-token?callbackURL=%2Freset-password%3Fredirect%3D%252Faccept-invitation%252Finvite-1",
        "https://app.example.com",
      ),
    );
    expect(link.origin).toBe("https://app.example.com");
    expect(link.pathname).toBe("/api/auth/reset-password/reset-token");
    expect(link.searchParams.get("callbackURL")).toBe(
      "https://app.example.com/reset-password?redirect=%2Faccept-invitation%2Finvite-1",
    );
  });

  test("preserves absolute callbacks and does not add missing callbacks", () => {
    const link = new URL(
      frontendAuthLink(
        "https://api.example.com/api/auth/verify-email?token=token&callbackURL=https%3A%2F%2Fdesktop.startup-os.local%2Flogin",
        "https://app.example.com",
      ),
    );
    expect(link.searchParams.get("callbackURL")).toBe("https://desktop.startup-os.local/login");
    const noCallback = new URL(
      frontendAuthLink(
        "https://api.example.com/api/auth/verify-email?token=token",
        "https://app.example.com",
      ),
    );
    expect(noCallback.searchParams.has("callbackURL")).toBe(false);
  });
});

describe("desktop auth email links", () => {
  const options = { baseURL: "https://api.example.com" };

  test("opens verification in the desktop renderer when its callback identifies desktop", () => {
    const link = new URL(
      frontendAuthLink(
        "https://api.example.com/api/auth/verify-email?token=secret&callbackURL=https%3A%2F%2Fdesktop.startup-os.local%2Forganizations",
        "https://app.example.com",
        options,
      ),
    );
    expect(link.origin).toBe(options.baseURL);
    expect(link.pathname).toBe("/desktop/open");
    const target = new URL(link.searchParams.get("path")!, "https://desktop.startup-os.local");
    expect(target.pathname).toBe("/api/auth/verify-email");
    expect(target.searchParams.get("token")).toBe("secret");
    expect(target.searchParams.get("callbackURL")).toBe(
      "https://desktop.startup-os.local/organizations",
    );
  });

  test("anchors relative reset callbacks to desktop for desktop requests", () => {
    const link = new URL(
      frontendAuthLink(
        "https://api.example.com/api/auth/reset-password/reset-secret?callbackURL=%2Freset-password",
        "http://localhost:3000",
        {
          ...options,
          request: new Request("https://api.example.com", {
            headers: { Origin: "https://desktop.startup-os.local" },
          }),
        },
      ),
    );
    const target = new URL(link.searchParams.get("path")!, "https://desktop.startup-os.local");
    expect(target.pathname).toBe("/api/auth/reset-password/reset-secret");
    expect(target.searchParams.get("callbackURL")).toBe(
      "https://desktop.startup-os.local/reset-password",
    );
  });

  test("anchors verification callbacks from desktop forms and preserves their redirect", () => {
    const request = new Request("https://api.example.com", {
      headers: { Origin: "https://desktop.startup-os.local" },
    });
    const link = new URL(
      frontendAuthLink(
        "https://api.example.com/api/auth/verify-email?token=secret&callbackURL=%2Flogin%3Fredirect%3D%252Faccept-invitation%252Finvite-1",
        "http://localhost:3000",
        { ...options, request },
      ),
    );
    const target = new URL(link.searchParams.get("path")!, "https://desktop.startup-os.local");
    expect(target.pathname).toBe("/api/auth/verify-email");
    expect(target.searchParams.get("token")).toBe("secret");
    expect(target.searchParams.get("callbackURL")).toBe(
      "https://desktop.startup-os.local/login?redirect=%2Faccept-invitation%2Finvite-1",
    );
  });

  test("keeps browser callbacks on the configured frontend with backend options", () => {
    const request = new Request("https://api.example.com", {
      headers: { Origin: "http://localhost:3000" },
    });
    const value =
      "https://api.example.com/api/auth/reset-password/secret?callbackURL=%2Freset-password";
    expect(frontendAuthLink(value, "http://localhost:3000", { ...options, request })).toBe(
      frontendAuthLink(value, "http://localhost:3000"),
    );
  });

  test("uses configured backend when the primary frontend is desktop", () => {
    const link = new URL(
      frontendAuthLink(
        "https://api.example.com/api/auth/verify-email?token=secret",
        "https://desktop.startup-os.local",
        options,
      ),
    );
    expect(link.origin).toBe(options.baseURL);
    expect(link.pathname).toBe("/desktop/open");
    expect(link.searchParams.get("path")).toBe("/api/auth/verify-email?token=secret");
  });

  test("does not use an untrusted request origin for email links", () => {
    const request = new Request("https://api.example.com", {
      headers: { Origin: "https://evil.example" },
    });
    expect(
      frontendAuthLink(
        "https://api.example.com/api/auth/verify-email?token=secret&callbackURL=%2Flogin",
        "http://localhost:3000",
        { ...options, request },
      ),
    ).toBe(
      "http://localhost:3000/api/auth/verify-email?token=secret&callbackURL=http%3A%2F%2Flocalhost%3A3000%2Flogin",
    );
  });

  test("routes desktop invitations through the landing without changing browser invitations", () => {
    const request = new Request("https://api.example.com", {
      headers: { Origin: "https://desktop.startup-os.local" },
    });
    const link = new URL(
      invitationLink("invite-1", "http://localhost:3000", { ...options, request }),
    );
    expect(link.origin).toBe(options.baseURL);
    expect(link.pathname).toBe("/desktop/open");
    expect(link.searchParams.get("path")).toBe("/accept-invitation/invite-1");
    expect(invitationLink("invite-1", "http://localhost:3000", options)).toBe(
      "http://localhost:3000/accept-invitation/invite-1",
    );
    expect(
      new URL(invitationLink("invite-1", "https://desktop.startup-os.local", options)).pathname,
    ).toBe("/desktop/open");
  });
});
