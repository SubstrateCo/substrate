import { desktopLink, desktopOrigin, desktopPath, resolveDesktopLink } from "./links.ts";
import { describe, expect, test } from "bun:test";

describe("external desktop links", () => {
  test("routes each environment's links only to its own desktop", () => {
    for (const scheme of ["substrate", "substrate-dev"] as const) {
      const link = desktopLink("/dashboard?workspaceId=org", scheme);
      expect(link).toBe(`${scheme}://open/dashboard?workspaceId=org`);
      expect(resolveDesktopLink(link, desktopOrigin, scheme)).toBe(
        `${desktopOrigin}/dashboard?workspaceId=org`,
      );
      const other = scheme === "substrate" ? "substrate-dev" : "substrate";
      expect(resolveDesktopLink(link, desktopOrigin, other)).toBeNull();
    }
  });
  test("preserves organization-aware record navigation and invitation destinations", () => {
    for (const path of [
      "/tasks?workspaceId=org&projectId=project&taskId=task",
      "/accept-invitation/invite-1",
    ]) {
      expect(resolveDesktopLink(desktopLink(path), desktopOrigin)).toBe(
        new URL(path, desktopOrigin).href,
      );
    }
  });

  test("also opens validated app destinations in the development renderer", () => {
    expect(
      resolveDesktopLink(desktopLink("/accept-invitation/invite-1"), "http://localhost:3000"),
    ).toBe("http://localhost:3000/accept-invitation/invite-1");
  });

  test("rejects external targets, arbitrary API operations, and malformed destinations", () => {
    for (const path of [
      "https://evil.test/tasks",
      "//evil.test/tasks",
      "/%2Fexample.com",
      "/%5Cevil.test",
      "/api",
      "/api/auth/sign-out",
      "/api/auth/verify-email?token=verification-token",
      "/api/auth/reset-password/reset-token",
      "/api/v1/tasks/mutations",
      "/api/auth/reset-password/a/b",
      "/tasks%0Aignored",
      "/%ZZ",
    ]) {
      expect(desktopPath.safeParse(path).success).toBe(false);
    }
    for (const value of [
      "https://desktop.substrate.local/tasks",
      "substrate://evil.test/tasks",
      "substrate://user@open/tasks",
      "substrate://open:80/tasks",
      "file:///tasks",
      "substrate://open//evil.test",
      "substrate://open/api/auth/sign-out",
      "not a URL",
    ]) {
      expect(resolveDesktopLink(value, desktopOrigin)).toBeNull();
    }
  });
});
