import {
  calendarSocialProviders,
  isCalendarProviderSignIn,
  requestedProvider,
} from "./calendar-accounts";
import { expect, test } from "bun:test";

test("Google is offered only when configured, with identity scopes, offline access, and no sign-up", () => {
  expect(calendarSocialProviders({ google: undefined, microsoft: undefined })).toEqual({});
  const providers = calendarSocialProviders({
    google: { clientId: "id", clientSecret: "secret" },
    microsoft: { clientId: "id", clientSecret: "secret", tenantId: "common" },
  });
  // Product scopes come from each link, so the provider asks only for identity scopes.
  expect(providers).toEqual({
    google: {
      clientId: "id",
      clientSecret: "secret",
      disableDefaultScope: true,
      scope: ["openid", "email", "profile"],
      includeGrantedScopes: true,
      accessType: "offline",
      prompt: "consent",
      disableSignUp: true,
      disableImplicitSignUp: true,
    },
  });
});

test("calendar providers cannot start a sign-in, but can be linked", () => {
  // Request bodies are JSON, parsed the way the auth hook parses them.
  const signIn = (path: string, body: string) =>
    isCalendarProviderSignIn(path, requestedProvider.parse(JSON.parse(body)).provider);
  expect(signIn("/sign-in/social", JSON.stringify({ provider: "google" }))).toBe(true);
  expect(signIn("/sign-in/social", JSON.stringify({ provider: "microsoft" }))).toBe(true);
  expect(
    signIn("/link-social", JSON.stringify({ provider: "google", callbackURL: "/settings" })),
  ).toBe(false);
  expect(signIn("/sign-in/email", JSON.stringify({ email: "a@example.test" }))).toBe(false);
  expect(signIn("/sign-in/social", "null")).toBe(false);
});
