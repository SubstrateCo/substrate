import {
  failure,
  publicFailure,
  success,
  type ServiceErrorCode,
} from "@substrate/contracts/result";

import { respond, respondCancellable, v } from "./http";
import { expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

test("invalid input answers a public 400 without running the handler", async () => {
  let handled = false;
  const app = new Hono().post("/", v("json", z.object({ id: z.uuid() })), (c) => {
    handled = true;
    return c.json(c.req.valid("json"));
  });
  const response = await app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "invalid" }),
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual(publicFailure("INVALID_INPUT", "Invalid request input."));
  expect(handled).toBe(false);
});

test.each([
  ["INVALID_INPUT", 400],
  ["UNAUTHENTICATED", 401],
  ["FORBIDDEN", 403],
  ["WORKSPACE_CHANGED", 403],
  ["NOT_FOUND", 404],
  ["CONFLICT", 409],
  ["PAYLOAD_TOO_LARGE", 413],
  ["INTERNAL_ERROR", 500],
] as const satisfies readonly (readonly [ServiceErrorCode, number])[])(
  "%s failures answer %d with the result body",
  async (code, status) => {
    const result = failure(code, "Reason.");
    const response = await new Hono().get("/", (c) => respond(c, result)).request("/");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(result);
  },
);

test("successful results answer 200 with their data", async () => {
  const response = await new Hono()
    .get("/", (c) => respond(c, success({ id: "one" })))
    .request("/");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(success({ id: "one" }));
});

test("client cancellation answers 499 instead of a server error", async () => {
  const controller = new AbortController();
  const app = new Hono().get("/", (c) =>
    respondCancellable(c, async (signal) => {
      controller.abort();
      signal.throwIfAborted();
      return success(null);
    }),
  );
  const response = await app.request("/", { signal: controller.signal });
  expect(response.status).toBe(499);
});

test("failures without cancellation still surface as errors", async () => {
  const app = new Hono()
    .get("/", (c) =>
      respondCancellable(c, async () => {
        throw new Error("boom");
      }),
    )
    .onError((_error, c) => c.text("error", 500));
  expect((await app.request("/")).status).toBe(500);
});
