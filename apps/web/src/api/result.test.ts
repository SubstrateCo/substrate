import { expect, test } from "bun:test";
import { readResult, ApiError } from "./result";

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
