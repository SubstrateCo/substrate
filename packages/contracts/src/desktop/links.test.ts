import { desktopLink, desktopOrigin, desktopPath, resolveDesktopLink } from "./links.js";
import { describe, expect, test } from "bun:test";

describe("external desktop links", () => {
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
      "https://desktop.startup-os.local/tasks",
      "startupos://evil.test/tasks",
      "startupos://user@open/tasks",
      "startupos://open:80/tasks",
      "file:///tasks",
      "startupos://open//evil.test",
      "startupos://open/api/auth/sign-out",
      "not a URL",
    ]) {
      expect(resolveDesktopLink(value, desktopOrigin)).toBeNull();
    }
  });
});
