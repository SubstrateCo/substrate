import { failure, success } from "@startup-os/contracts/result";

import { respond } from "./http";
import { expect, test } from "bun:test";
import { Hono } from "hono";

test("maps successful service results to the application response envelope", async () => {
  const app = new Hono().get("/", (c) => respond(c, success({ id: "task" })));
  const response = await app.request("/");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: { id: "task" } });
});

test.each([
  ["INVALID_INPUT", 400],
  ["UNAUTHENTICATED", 401],
  ["FORBIDDEN", 403],
  ["NOT_FOUND", 404],
  ["CONFLICT", 409],
  ["PAYLOAD_TOO_LARGE", 413],
  ["INTERNAL_ERROR", 500],
] as const)("maps %s to HTTP %d using the shared error envelope", async (code, status) => {
  const app = new Hono().get("/", (c) => respond(c, failure(code, "Safe error.")));
  const response = await app.request("/");
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({
    success: false,
    error: { code, message: "Safe error." },
  });
});
