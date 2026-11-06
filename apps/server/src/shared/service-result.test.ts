import { describe, expect, spyOn, test } from "bun:test";
import { AccessDeniedError, ConflictError, ValidationError } from "@startup-os/database";
import { serviceResult, ServiceError } from "./service-result";

describe("service results", () => {
  test("keeps successful domain data in the result", async () => {
    expect(await serviceResult(async () => ({ id: "task" }))).toEqual({
      success: true,
      data: { id: "task" },
    });
  });

  test.each([
    [
      new ServiceError("UNAUTHENTICATED", "Sign in to continue."),
      "UNAUTHENTICATED",
      "Sign in to continue.",
    ],
    [new ServiceError("FORBIDDEN", "Verify your email."), "FORBIDDEN", "Verify your email."],
    [new AccessDeniedError(), "NOT_FOUND", "Item not found or access denied."],
    [new ValidationError("Invalid task status."), "INVALID_INPUT", "Invalid task status."],
    [new ConflictError("Task already exists."), "CONFLICT", "Task already exists."],
  ] as const)("maps expected failure %s to %s", async (error, code, message) => {
    const result = await serviceResult(async () => {
      throw error;
    });
    expect(result).toEqual({ success: false, error: { code, message } });
  });

  test("does not expose unexpected errors or their messages in logs", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await serviceResult(async () => {
        throw new Error("postgres://private-credential");
      });
      expect(result).toEqual({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "The operation is unavailable. Please try again.",
        },
      });
      expect(log).toHaveBeenCalledWith("Service operation failed", "Error");
    } finally {
      log.mockRestore();
    }
  });
});
