import {
  nativeValidationMessage,
  schemaIssueMessage,
  type NativeFieldState,
} from "./validation-messages";
import { expect, test } from "bun:test";
import { z } from "zod";

const valid: NativeFieldState["validity"] = {
  valueMissing: false,
  typeMismatch: false,
  tooShort: false,
  tooLong: false,
  patternMismatch: false,
  rangeUnderflow: false,
  rangeOverflow: false,
  stepMismatch: false,
  badInput: false,
};

const field = (
  failure: Partial<NativeFieldState["validity"]>,
  rest: Omit<NativeFieldState, "validity"> = { type: "text" },
) => nativeValidationMessage({ ...rest, validity: { ...valid, ...failure } });

test("empty required fields name the field instead of using browser copy", () => {
  expect(field({ valueMissing: true }, { type: "text", label: "Workspace name" })).toBe(
    "Enter workspace name.",
  );
  expect(field({ valueMissing: true }, { type: "email", label: "Email" })).toBe(
    "Enter your email address.",
  );
  expect(field({ valueMissing: true }, { type: "password", label: "Password" })).toBe(
    "Enter your password.",
  );
});

test("a field-specific missing message wins over the label-based copy", () => {
  expect(
    field(
      { valueMissing: true },
      { type: "text", label: "Name", missingMessage: "Enter your name." },
    ),
  ).toBe("Enter your name.");
});

test("format and length failures explain how to correct the value", () => {
  expect(field({ typeMismatch: true }, { type: "email" })).toBe(
    "Enter a complete email address, like name@company.com.",
  );
  expect(field({ typeMismatch: true }, { type: "email", multiple: true })).toBe(
    "Enter complete email addresses, separated by commas.",
  );
  expect(field({ tooShort: true }, { type: "password", minLength: 8 })).toBe(
    "Use at least 8 characters.",
  );
  expect(
    field(
      { patternMismatch: true },
      { type: "text", label: "Workspace slug", title: "Use lowercase letters." },
    ),
  ).toBe("Use lowercase letters.");
});

test("a custom validity message shows only when no built-in constraint fails", () => {
  expect(field({}, { type: "password", customMessage: "The passwords don’t match." })).toBe(
    "The passwords don’t match.",
  );
  expect(
    field(
      { valueMissing: true },
      {
        type: "password",
        missingMessage: "Enter the new password again.",
        customMessage: "The passwords don’t match.",
      },
    ),
  ).toBe("Enter the new password again.");
});

test("schema issues without their own message never show library text", () => {
  z.config({ customError: schemaIssueMessage });
  const messages = (schema: z.ZodType<string>, value: string) =>
    schema.safeParse(value).error?.issues.map((issue) => issue.message);
  expect(messages(z.string().min(1), "")).toEqual(["Fill in this field."]);
  expect(messages(z.string().max(3), "abcd")).toEqual(["Use 3 characters or fewer."]);
  expect(messages(z.email(), "nope")).toEqual(["Enter a complete email address."]);
  expect(messages(z.string().min(1, "Enter a channel name."), "")).toEqual([
    "Enter a channel name.",
  ]);
});
