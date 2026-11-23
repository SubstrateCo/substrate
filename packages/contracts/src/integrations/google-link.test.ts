import { googleLinkStartURL, isGoogleConsentURL } from "./google-link.ts";
import { expect, test } from "bun:test";

const ticket = "A".repeat(43);

test("the start page is always on the API origin and carries only the ticket", () => {
  expect(googleLinkStartURL(ticket, "https://api.example.test/other?x=1")).toBe(
    `https://api.example.test/api/v1/integrations/google/link/start?ticket=${ticket}`,
  );
  for (const value of [
    "",
    "A".repeat(42),
    "A".repeat(44),
    `${"A".repeat(42)}/`,
    "https://evil.test",
  ])
    expect(() => googleLinkStartURL(value, "https://api.example.test")).toThrow();
});

test("only Google's HTTPS consent host is a consent URL", () => {
  expect(isGoogleConsentURL("https://accounts.google.com/o/oauth2/v2/auth?state=s")).toBe(true);
  for (const value of [
    "http://accounts.google.com/o/oauth2/v2/auth",
    "https://accounts.google.com.evil.test/",
    "https://evil.test/?u=https://accounts.google.com/",
    "https://user@accounts.google.com/",
    "https://accounts.google.com:8443/",
    "javascript:alert(1)",
    "/settings",
    undefined,
  ])
    expect(isGoogleConsentURL(value)).toBe(false);
});
