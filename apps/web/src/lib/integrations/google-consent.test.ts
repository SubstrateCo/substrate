import { googleConsentURL } from "./google-consent";
import { expect, test } from "bun:test";

test("a Google link navigates only to Google's consent screen", () => {
  const consent = "https://accounts.google.com/o/oauth2/v2/auth?state=s";
  expect(googleConsentURL(consent)).toBe(consent);
  for (const value of [
    undefined,
    "",
    "https://evil.test/o/oauth2/v2/auth",
    "http://accounts.google.com/o/oauth2/v2/auth",
    "javascript:alert(1)",
  ])
    expect(() => googleConsentURL(value)).toThrow("Google link failed.");
});
