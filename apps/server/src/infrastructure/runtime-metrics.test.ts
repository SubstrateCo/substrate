import { createApp } from "../app";
import { appFixture } from "../test-support";
import { createRuntimeMetrics } from "./runtime-metrics";
import { expect, test } from "bun:test";
import { Hono } from "hono";

test("metrics route and collector are absent without opt-in", async () => {
  const metrics = createRuntimeMetrics(false, 10);
  expect(metrics).toBeUndefined();
  const app = createApp({ ...appFixture(), metrics });
  expect((await app.request("/internal/metrics")).status).toBe(404);
});

test("counts active requests, excludes metrics reads, and releases failed requests", async () => {
  const metrics = createRuntimeMetrics(true, 24)!;
  const app = new Hono();
  app.use("*", metrics.middleware);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  app.get("/work", async () => {
    entered.resolve();
    await release.promise;
    throw new Error("test failure");
  });
  app.onError((_, c) => c.text("failed", 500));
  const fullApp = createApp({ ...appFixture(), metrics });
  try {
    const pending = app.request("/work");
    await entered.promise;
    const response = await fullApp.request("/internal/metrics?reset=1");
    const body = await response.json();
    expect(body.inFlightRequests).toBe(1);
    expect(body.database.poolMaxConnections).toBe(24);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    release.resolve();
    await pending;
    expect(metrics.read(false).inFlightRequests).toBe(0);
  } finally {
    release.resolve();
    metrics.close();
  }
});
