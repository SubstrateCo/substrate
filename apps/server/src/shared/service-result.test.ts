import { AccessDeniedError, ConflictError, ValidationError } from "@substrate/database";

import { createServiceResult, ServiceError } from "./service-result";
import { APIError } from "better-auth/api";
import { describe, expect, test } from "bun:test";

function recorded() {
  const logs: string[][] = [];
  return { logs, serviceResult: createServiceResult((...line) => logs.push(line)) };
}
const { serviceResult } = recorded();

describe("service results", () => {
  test("cancellation is not logged or converted into a service failure", async () => {
    const controller = new AbortController();
    const { logs, serviceResult } = recorded();
    const result = serviceResult(async () => {
      controller.abort();
      controller.signal.throwIfAborted();
      return null;
    }, controller.signal);
    expect(await result.catch((error) => error)).toBe(controller.signal.reason);
    expect(logs).toEqual([]);
  });

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
    [
      new APIError("BAD_REQUEST", { message: "Private implementation details" }),
      "INVALID_INPUT",
      "Invalid request input.",
    ],
  ] as const)("maps expected failure %s to %s", async (error, code, message) => {
    const result = await serviceResult(async () => {
      throw error;
    });
    expect(result).toEqual({ success: false, error: { code, message, userMessage: message } });
  });

  test("trusts database error classes, not an error that only shares their name", async () => {
    const foreign = Object.assign(new Error("relation users: private detail"), {
      name: "ValidationError",
    });
    const result = await serviceResult(async () => {
      throw foreign;
    });
    expect(result).toMatchObject({ success: false, error: { code: "INTERNAL_ERROR" } });
  });

  test("preserves structured recovery reasons", async () => {
    expect(
      await serviceResult(async () => {
        throw new ServiceError("FORBIDDEN", "Verify your email.", "EMAIL_NOT_VERIFIED");
      }),
    ).toEqual({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Verify your email.",
        userMessage: "Verify your email.",
        reason: "EMAIL_NOT_VERIFIED",
      },
    });
  });

  test("does not expose unexpected errors or their messages in logs", async () => {
    const { logs, serviceResult } = recorded();
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
    expect(logs).toEqual([["Service operation failed", "Error"]]);
  });
});
