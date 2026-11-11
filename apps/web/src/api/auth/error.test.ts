import { authError } from "./error";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { unwrap } from "@/lib/auth/result";
import { expect, test } from "bun:test";

test("adapts known auth codes without trusting provider wording", () => {
  const error = authError({
    code: "INVALID_EMAIL_OR_PASSWORD",
    status: 401,
    message: "Private detail",
  });
  expect(error).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 });
  expect(actionErrorMessage(error)).toBe("Invalid email or password.");
  expect(actionErrorMessage(authError({ code: "ORGANIZATION_SLUG_ALREADY_TAKEN" }))).toBe(
    "This workspace slug is already taken.",
  );
});

test("unknown auth errors use safe fallback copy", () => {
  expect(
    actionErrorMessage(
      authError({ code: "UNKNOWN", message: "secret-host", status: 500 }),
      "Couldn’t sign in.",
    ),
  ).toBe("Couldn’t sign in.");
});

test("auth unwrapping preserves the code and approved message", () => {
  expect(() =>
    unwrap({
      data: null,
      error: { code: "USER_ALREADY_EXISTS", status: 422, message: "Private detail" },
    }),
  ).toThrow(
    expect.objectContaining({
      code: "USER_ALREADY_EXISTS",
      status: 422,
      userMessage: "An account with this email already exists.",
    }),
  );
});
