import { desktopEnvironment } from "./environment";
import { describe, expect, test } from "bun:test";

describe("public desktop distribution", () => {
  test("allows setup before an installer is published", () => {
    expect(desktopEnvironment({ APP_URL: "https://app.example.test" })).toEqual({
      frontendURL: "https://app.example.test",
      windowsURL: undefined,
    });
  });

  test("accepts a configured HTTPS Windows installer", () => {
    expect(
      desktopEnvironment({
        APP_URL: "https://app.example.test",
        STARTUP_OS_WINDOWS_DOWNLOAD_URL: "https://downloads.example.test/StartupOS.exe",
      }).windowsURL,
    ).toBe("https://downloads.example.test/StartupOS.exe");
  });

  test.each([
    "http://downloads.example.test/setup.exe",
    "javascript:alert(1)",
    "https://user:password@downloads.example.test/setup.exe",
    "//downloads.example.test/setup.exe",
  ])("rejects unsafe installer configuration %s", (value) => {
    expect(() => desktopEnvironment({ STARTUP_OS_WINDOWS_DOWNLOAD_URL: value })).toThrow();
  });

  test.each([
    "https://user:password@app.example.test",
    "https://app.example.test/path",
    "https://app.example.test?next=evil",
  ])("rejects a frontend URL that is not an explicit origin: %s", (APP_URL) => {
    expect(() => desktopEnvironment({ APP_URL })).toThrow();
  });
});
