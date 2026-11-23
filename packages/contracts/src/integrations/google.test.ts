import {
  googleProductScopes,
  grantedGoogleProducts,
  hasGoogleProduct,
  parseGrantedScopes,
} from "./google.ts";
import { expect, test } from "bun:test";

const [calendarScope] = googleProductScopes.calendar;

test("granted scopes parse from Better Auth's comma form and the OAuth space form", () => {
  expect(parseGrantedScopes(`openid,email,${calendarScope}`)).toEqual([
    "openid",
    "email",
    calendarScope,
  ]);
  expect(parseGrantedScopes(`openid email  ${calendarScope} `)).toEqual([
    "openid",
    "email",
    calendarScope,
  ]);
  expect(parseGrantedScopes(", openid,,")).toEqual(["openid"]);
  expect(parseGrantedScopes(null)).toEqual([]);
  expect(parseGrantedScopes("")).toEqual([]);
});

test("a product is granted only when the grant has all of its scopes", () => {
  expect(grantedGoogleProducts(`openid,email,profile,${calendarScope}`)).toEqual(["calendar"]);
  expect(hasGoogleProduct(`openid email ${calendarScope}`, "calendar")).toBe(true);
  expect(hasGoogleProduct("openid,email,profile", "calendar")).toBe(false);
  expect(hasGoogleProduct(null, "calendar")).toBe(false);
  // A broader-looking scope with the same prefix is a different scope.
  expect(hasGoogleProduct("https://www.googleapis.com/auth/calendar.events", "calendar")).toBe(
    false,
  );
});
