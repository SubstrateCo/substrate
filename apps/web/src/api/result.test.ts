import { readResult, ApiError, NetworkError } from "./result";
import { expect, test } from "bun:test";

test("returns success data, including nullable session data", async () => {
  expect(
    await readResult(Promise.resolve(Response.json({ success: true, data: null }))),
  ).toBeNull();
  expect(
    await readResult(Promise.resolve(Response.json({ success: true, data: { id: "task" } }))),
  ).toEqual({ id: "task" });
});

test("rejects error envelopes with their code, message, and HTTP status", async () => {
  const response = Promise.resolve(
    Response.json(
      { success: false, error: { code: "FORBIDDEN", message: "Workspace access denied." } },
      { status: 403 },
    ),
  );
  try {
    await readResult(response);
    throw new Error("Expected an API error");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: "Workspace access denied.",
      status: 403,
    });
  }
});

test("rejects an error envelope even when HTTP status is successful", async () => {
  try {
    await readResult(
      Promise.resolve(
        Response.json({ success: false, error: { code: "CONFLICT", message: "Already exists." } }),
      ),
    );
    throw new Error("Expected an API error");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "CONFLICT" });
  }
});

test("preserves public copy and structured reasons", async () => {
  const error = await readResult(
    Promise.resolve(
      Response.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Verify email.",
            userMessage: "Verify your email to continue.",
            reason: "EMAIL_NOT_VERIFIED",
          },
        },
        { status: 403 },
      ),
    ),
  ).catch((error) => error);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    code: "FORBIDDEN",
    status: 403,
    userMessage: "Verify your email to continue.",
    reason: "EMAIL_NOT_VERIFIED",
  });
});

test("classifies rejected requests but not response parsing failures as connectivity failures", async () => {
  expect(
    await readResult(Promise.reject(new TypeError("Failed to fetch"))).catch((error) => error),
  ).toBeInstanceOf(NetworkError);
  const parsingError = new TypeError("Broken response handler");
  expect(
    await readResult(
      Promise.resolve({
        status: 200,
        json: async () => {
          throw parsingError;
        },
      }),
    ).catch((error) => error),
  ).toBe(parsingError);
  const cancellation = new DOMException("Aborted", "AbortError");
  expect(await readResult(Promise.reject(cancellation)).catch((error) => error)).toBe(cancellation);
});
