import { failure, publicFailure } from "./result";
import { expect, test } from "bun:test";

test("only public failures opt into display copy, while preserving the installed-client message", () => {
  expect(publicFailure("CONFLICT", "Choose another name.")).toEqual({
    success: false,
    error: {
      code: "CONFLICT",
      message: "Choose another name.",
      userMessage: "Choose another name.",
    },
  });
  expect(failure("INTERNAL_ERROR", "The operation is unavailable.")).toEqual({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "The operation is unavailable." },
  });
});

test("public failures preserve a structured reason when supplied", () => {
  expect(publicFailure("FORBIDDEN", "Verify your email.", "EMAIL_NOT_VERIFIED")).toMatchObject({
    error: { reason: "EMAIL_NOT_VERIFIED", userMessage: "Verify your email." },
  });
});
