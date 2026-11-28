import type { z } from "zod";

export type NativeFieldState = {
  validity: Pick<
    ValidityState,
    | "valueMissing"
    | "typeMismatch"
    | "tooShort"
    | "tooLong"
    | "patternMismatch"
    | "rangeUnderflow"
    | "rangeOverflow"
    | "stepMismatch"
    | "badInput"
  >;
  type: string;
  multiple?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: string;
  max?: string;
  label?: string;
  title?: string;
  missingMessage?: string;
  customMessage?: string;
};

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

export function nativeValidationMessage(field: NativeFieldState): string {
  const { validity, type, label = "" } = field;
  const name = label.trim() ? lower(label.trim()) : "a value";
  if (validity.valueMissing) {
    if (field.missingMessage) return field.missingMessage;
    if (type === "email")
      return field.multiple ? "Enter at least one email address." : "Enter your email address.";
    if (type === "password") return "Enter your password.";
    return `Enter ${name}.`;
  }
  if (validity.typeMismatch) {
    if (type === "email")
      return field.multiple
        ? "Enter complete email addresses, separated by commas."
        : "Enter a complete email address, like name@company.com.";
    if (type === "url") return "Enter a complete link, like https://example.com.";
    return `Check the ${name}.`;
  }
  if (validity.tooShort && field.minLength) return `Use at least ${field.minLength} characters.`;
  if (validity.tooLong && field.maxLength) return `Use ${field.maxLength} characters or fewer.`;
  if (validity.patternMismatch) return field.title?.trim() || `Check the format of the ${name}.`;
  if (validity.rangeUnderflow && field.min) return `Enter ${field.min} or more.`;
  if (validity.rangeOverflow && field.max) return `Enter ${field.max} or less.`;
  if (validity.badInput || validity.stepMismatch) return `Enter a valid ${name}.`;
  return field.customMessage || `Check the ${name}.`;
}

export function schemaIssueMessage(issue: z.core.$ZodRawIssue): string | undefined {
  switch (issue.code) {
    case "too_small":
      if (issue.origin === "string")
        return Number(issue.minimum) <= 1
          ? "Fill in this field."
          : `Use at least ${issue.minimum} characters.`;
      if (issue.origin === "array") return "Choose at least one.";
      return `Enter ${issue.minimum} or more.`;
    case "too_big":
      if (issue.origin === "string") return `Use ${issue.maximum} characters or fewer.`;
      if (issue.origin === "array") return `Choose ${issue.maximum} or fewer.`;
      return `Enter ${issue.maximum} or less.`;
    case "invalid_format":
      if (issue.format === "email") return "Enter a complete email address.";
      if (issue.format === "url") return "Enter a complete link.";
      return "Check the format of this field.";
    case "invalid_type":
      return issue.input === undefined || issue.input === null
        ? "Fill in this field."
        : "Check this field.";
    case "invalid_value":
      return "Choose one of the options.";
    case "custom":
    case "invalid_element":
    case "invalid_key":
    case "invalid_union":
    case "not_multiple_of":
    case "unrecognized_keys":
      return undefined;
  }
}
