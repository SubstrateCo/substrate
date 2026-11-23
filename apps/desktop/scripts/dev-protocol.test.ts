import { developmentBundleInfo } from "./dev-protocol.js";
import { describe, expect, test } from "bun:test";

describe("macOS development protocol", () => {
  test("uses a distinct development bundle ID and declares the callback scheme", () => {
    const info = developmentBundleInfo({
      CFBundleIdentifier: "com.github.Electron",
      CFBundleExecutable: "Electron",
      CFBundleVersion: "43.8.7",
    });
    expect(info.CFBundleIdentifier).toBe("com.substrate.desktop.dev");
    expect(info.CFBundleName).toBe("Substrate Dev");
    expect(info.CFBundleExecutable).toBe("Electron");
    expect(info.CFBundleVersion).toBe("43.8.7");
    expect(info.CFBundleURLTypes).toEqual([
      {
        CFBundleURLName: "com.substrate.desktop.dev",
        CFBundleURLSchemes: ["substrate-dev"],
      },
    ]);
  });

  test("preserves unrelated handlers and is idempotent", () => {
    const unrelated = { CFBundleURLName: "existing", CFBundleURLSchemes: ["other-dev"] };
    const once = developmentBundleInfo({
      CFBundleIdentifier: "com.github.Electron",
      CFBundleURLTypes: [
        { ...unrelated, CFBundleURLSchemes: ["other-dev", "substrate-dev"] },
        { CFBundleURLSchemes: ["substrate-dev"] },
      ],
    });
    expect(once.CFBundleURLTypes).toHaveLength(2);
    expect(once.CFBundleURLTypes[0]).toEqual(unrelated);
    expect(developmentBundleInfo(once)).toEqual(once);
  });
});
