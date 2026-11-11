import { actionErrorMessage } from "./action-error-message";
import { ApiError, NetworkError } from "@/api/result";
import { expect, test } from "bun:test";

test("unknown errors use safe action copy instead of server details", () => {
  expect(
    actionErrorMessage(
      new Error("SQL connection failed: secret-host"),
      "Couldn’t send invitation.",
    ),
  ).toBe("Couldn’t send invitation.");
});

test("offline, rate-limited, and ended-session failures say what to do next", () => {
  expect(
    actionErrorMessage(new NetworkError(new TypeError("Failed to fetch")), "Couldn’t save."),
  ).toBe("Couldn’t reach the server. Check your connection and try again.");
  expect(
    actionErrorMessage(Object.assign(new Error("Too many requests"), { status: 429 }), "Couldn’t."),
  ).toBe("Too many attempts. Wait a minute and try again.");
  expect(
    actionErrorMessage(
      Object.assign(new Error("secret detail"), { code: "UNAUTHENTICATED", status: 401 }),
      "Couldn’t.",
    ),
  ).toBe("Your session ended. Sign in again.");
  expect(
    actionErrorMessage(Object.assign(new Error("Wrong password"), { status: 401 }), "Couldn’t."),
  ).toBe("Couldn’t.");
});

test("shows explicit public API copy without matching its wording", () => {
  const error = new ApiError("INVALID_INPUT", "Internal detail", 400, {
    userMessage: "Choose a different task status.",
  });
  expect(actionErrorMessage(error)).toBe("Choose a different task status.");
});

test("does not infer public copy or connectivity from ordinary exceptions", () => {
  expect(actionErrorMessage(new Error("Invalid email or password"), "Couldn’t save.")).toBe(
    "Couldn’t save.",
  );
  expect(
    actionErrorMessage(new TypeError("Cannot read properties of undefined"), "Couldn’t save."),
  ).toBe("Couldn’t save.");
  expect(
    actionErrorMessage(new ApiError("CONFLICT", "Private detail", 409), "Couldn’t save."),
  ).toBe("Couldn’t save.");
});

test("recovery guidance takes precedence over public copy", () => {
  expect(
    actionErrorMessage(
      new ApiError("WORKSPACE_CHANGED", "detail", 403, {
        userMessage: "Something changed.",
      }),
    ),
  ).toBe("Your active workspace changed. Reload this page to continue.");
  expect(
    actionErrorMessage(
      new ApiError("UNAUTHENTICATED", "detail", 401, {
        userMessage: "Sign in to continue.",
      }),
    ),
  ).toBe("Your session ended. Sign in again.");
});

test("never displays public copy on internal errors", () => {
  expect(
    actionErrorMessage(
      new ApiError("INTERNAL_ERROR", "detail", 500, {
        userMessage: "secret-host",
      }),
      "Couldn’t save.",
    ),
  ).toBe("Couldn’t save.");
});
