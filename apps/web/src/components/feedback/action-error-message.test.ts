import { actionErrorMessage } from "./action-error-message";
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
  expect(actionErrorMessage(new TypeError("Failed to fetch"), "Couldn’t save.")).toBe(
    "You’re offline. Check your connection and try again.",
  );
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

test("reviewed validation errors keep useful correction guidance", () => {
  expect(actionErrorMessage(new Error("The passwords do not match."))).toBe(
    "The passwords do not match.",
  );
  expect(actionErrorMessage(new Error("Invalid email or password"))).toBe(
    "Invalid email or password.",
  );
});
