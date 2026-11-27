import { browserInstallerPlatform, chooseInstallers, installMode } from "./installer";
import { describe, expect, test } from "bun:test";

const agents = {
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  linux:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
};

describe("browser installer platform", () => {
  test.each([
    ["windows", agents.windows, 0, "windows"],
    ["mac", agents.mac, 0, "mac"],
    ["iPad, which reports a Mac user agent", agents.mac, 5, undefined],
    ["iPhone", agents.iphone, 5, undefined],
    ["linux", agents.linux, 0, undefined],
  ] as const)("detects %s", (_, userAgent, maxTouchPoints, expected) => {
    expect(browserInstallerPlatform({ userAgent, maxTouchPoints })).toBe(expected);
  });
});

describe("installer choice", () => {
  const both = { windows: true, mac: true };

  test("offers the browser's OS first and the rest second", () => {
    expect(chooseInstallers(both, "mac")).toEqual({ primary: "mac", others: ["windows"] });
    expect(chooseInstallers(both, "windows")).toEqual({ primary: "windows", others: ["mac"] });
  });

  test("does not offer another OS's installer first when the browser's OS has none", () => {
    expect(chooseInstallers({ windows: true, mac: false }, "mac")).toEqual({
      primary: undefined,
      others: ["windows"],
    });
  });

  test("offers the first published installer when the OS is unknown", () => {
    expect(chooseInstallers({ windows: false, mac: true }, undefined)).toEqual({
      primary: "mac",
      others: [],
    });
    expect(chooseInstallers({ windows: false, mac: false }, undefined)).toEqual({
      primary: undefined,
      others: [],
    });
  });
});

describe("installMode", () => {
  test("the viewer's installer is primary, and stays primary after a failed refresh", () => {
    expect(installMode("ready", "mac")).toEqual({ kind: "download", platform: "mac" });
    expect(installMode("stale", "mac")).toEqual({ kind: "download", platform: "mac" });
  });
  test("a checked release without the viewer's installer makes the browser primary", () => {
    expect(installMode("ready", undefined)).toEqual({ kind: "browser" });
    expect(installMode("stale", undefined)).toEqual({ kind: "browser" });
  });
  test("a failed first check offers neither the installer nor the browser as primary", () => {
    expect(installMode("error", undefined)).toEqual({ kind: "error" });
    expect(installMode("loading", undefined)).toEqual({ kind: "loading" });
  });
});
