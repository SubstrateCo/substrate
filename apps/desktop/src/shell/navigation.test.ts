import { bundledApplicationURL, navigationTarget } from "./navigation.js";
import { describe, expect, test } from "bun:test";

describe("desktop navigation", () => {
  test("bundled navigation trusts only the bundled origin, including auth callbacks", () => {
    expect(
      navigationTarget(`${bundledApplicationURL}/api/auth/callback`, bundledApplicationURL),
    ).toBe("internal");
    for (const url of [
      "http://localhost:3000/tasks",
      "https://desktop.substrate.local.evil.test/tasks",
      "https://desktop.substrate.local:444/tasks",
      "http://desktop.substrate.local/tasks",
    ]) {
      expect(navigationTarget(url, bundledApplicationURL)).toBe("external");
    }
    expect(navigationTarget("https://user@desktop.substrate.local/", bundledApplicationURL)).toBe(
      "blocked",
    );
  });
  test("keeps workspace routes and auth callbacks in the app", () => {
    expect(navigationTarget("http://localhost:3000/tasks?workspaceId=org&taskId=task")).toBe(
      "internal",
    );
    expect(navigationTarget("http://localhost:3000/api/auth/verify-email?token=example")).toBe(
      "internal",
    );
  });

  test("opens external web links in the browser", () => {
    expect(navigationTarget("https://example.com/docs")).toBe("external");
    expect(navigationTarget("http://localhost:3001/")).toBe("external");
    expect(navigationTarget("http://localhost.example.com:3000/")).toBe("external");
  });

  test("rejects unsafe protocols, malformed URLs, and embedded credentials", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///C:/Windows/system.ini",
      "data:text/html,hello",
      "substrate://tasks",
      "not a URL",
      "https://user:password@example.com/",
      "http://user:password@localhost:3000/",
    ]) {
      expect(navigationTarget(url)).toBe("blocked");
    }
  });
});
