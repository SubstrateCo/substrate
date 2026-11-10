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

test("maps a failure code to its HTTP status inside the shared error envelope", async () => {
  const app = new Hono().get("/", (c) => respond(c, failure("NOT_FOUND", "Safe error.")));
  const response = await app.request("/");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    success: false,
    error: { code: "NOT_FOUND", message: "Safe error." },
  });
});
