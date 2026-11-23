import { googleProductScopes } from "@substrate/contracts/integrations/google";

import { googleAccessToken } from "./credentials";
import { GoogleReauthRequired, GoogleScopeMissing, GoogleUnavailable } from "./errors";
import { APIError } from "better-auth/api";
import { expect, test } from "bun:test";

const [calendarScope] = googleProductScopes.calendar;

function source(result: () => Promise<{ accessToken?: string; scopes: string[] }>) {
  const calls: unknown[] = [];
  return {
    calls,
    request: {
      auth: {
        api: {
          getAccessToken: async (input: { body: { accountId: string; userId: string } }) => {
            calls.push(input);
            return result();
          },
        },
      },
      userId: "user-1",
      accountId: "account-row-1",
      product: "calendar" as const,
    },
  };
}

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected a rejection.");
};

test("loads the token for the user's account row when the grant has the product's scopes", async () => {
  const granted = source(async () => ({ accessToken: "token", scopes: ["openid", calendarScope] }));
  expect(await googleAccessToken(granted.request)).toBe("token");
  expect(granted.calls).toEqual([{ body: { accountId: "account-row-1", userId: "user-1" } }]);
});

test("a grant without the product's scopes names the missing product", async () => {
  const narrow = source(async () => ({ accessToken: "token", scopes: ["openid", "email"] }));
  const error = await rejection(googleAccessToken(narrow.request));
  expect(error).toBeInstanceOf(GoogleScopeMissing);
  expect(error).toMatchObject({ product: "calendar", errorCode: "calendar_scope_missing" });
});

test("a missing account, failed refresh, or empty token requires reauthorization", async () => {
  for (const code of ["ACCOUNT_NOT_FOUND", "FAILED_TO_GET_ACCESS_TOKEN"]) {
    const failed = source(async () => {
      throw APIError.from("BAD_REQUEST", { code, message: "Failed" });
    });
    expect(await rejection(googleAccessToken(failed.request))).toBeInstanceOf(GoogleReauthRequired);
  }
  const empty = source(async () => ({ scopes: [calendarScope] }));
  expect(await rejection(googleAccessToken(empty.request))).toBeInstanceOf(GoogleReauthRequired);
});

test("an unconfigured provider or other failure is unavailable without leaking details", async () => {
  const unconfigured = source(async () => {
    throw APIError.from("BAD_REQUEST", { code: "PROVIDER_NOT_SUPPORTED", message: "No" });
  });
  expect(await rejection(googleAccessToken(unconfigured.request))).toMatchObject({
    errorCode: "provider_not_configured",
  });
  const failed = source(async () => {
    throw new Error("connection to database failed: password=secret");
  });
  const error = await rejection(googleAccessToken(failed.request));
  expect(error).toBeInstanceOf(GoogleUnavailable);
  expect(error).toMatchObject({ errorCode: "credential_unavailable" });
  expect(String(error)).not.toContain("secret");
});
