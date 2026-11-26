import { serverOrigin } from "./origin";
import { mobileApiURL } from "./urls";
import { expect, test } from "bun:test";

test("configured origins cannot include credentials, alternate protocols or URL paths", () => {
  for (const value of [
    undefined,
    "file:///app",
    "https://user:secret@api.example.com",
    "https://api.example.com/api",
    "https://api.example.com?token=secret",
  ])
    expect(() => serverOrigin(value)).toThrow();
  expect(serverOrigin("http://localhost:3101")).toBe("http://localhost:3101");
});

test("only configured-server product links are rewritten for mobile monitoring", () => {
  const base = "https://api.example.com";
  expect(mobileApiURL("/api/v1/files/one/content?download=true", base)).toBe(
    `${base}/api/mobile/files/one/content?download=true`,
  );
  expect(mobileApiURL("/api/mobile/files/one/content", base)).toBe(
    `${base}/api/mobile/files/one/content`,
  );
  for (const value of [
    "https://storage.example.com/api/v1/file?signature=private",
    "//evil.example/api/v1/file",
    "/api/auth/sign-out",
    "https://user:pass@api.example.com/api/v1/files",
  ])
    expect(() => mobileApiURL(value, base)).toThrow();
});
