import { expect, test } from "bun:test";
import { actionErrorMessage } from "./action-error-message";

test("unknown errors use safe action copy instead of server details", () => {
  expect(
    actionErrorMessage(
      new Error("SQL connection failed: secret-host"),
      "Couldn’t send invitation.",
    ),
  ).toBe("Couldn’t send invitation.");
});

test("reviewed validation errors keep useful correction guidance", () => {
  expect(actionErrorMessage(new Error("The passwords do not match."))).toBe(
    "The passwords do not match.",
  );
  expect(actionErrorMessage(new Error("Invalid email or password"))).toBe(
    "Invalid email or password.",
  );
});
