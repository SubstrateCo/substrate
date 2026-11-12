import type { Hono, MiddlewareHandler } from "hono";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";

export function createRuntimeMetrics(enabled: boolean, poolMaxConnections: number) {
  if (!enabled) return undefined;
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  let startedAt = performance.now();
  let utilization = performance.eventLoopUtilization();
  let cpu = process.cpuUsage();
  let inFlightRequests = 0;

  const middleware: MiddlewareHandler = async (c, next) => {
    if (c.req.path === "/internal/metrics") return next();
    inFlightRequests++;
    try {
      await next();
    } finally {
      inFlightRequests--;
    }
  };

  return {
    middleware,
    read(reset: boolean) {
      const now = performance.now();
      const currentCpu = process.cpuUsage();
      const currentUtilization = performance.eventLoopUtilization();
      const result = {
        windowMs: now - startedAt,
        eventLoopDelayMs: {
          p50: delay.percentile(50) / 1e6,
          p95: delay.percentile(95) / 1e6,
          p99: delay.percentile(99) / 1e6,
          max: delay.count ? delay.max / 1e6 : 0,
        },
        eventLoopUtilization: performance.eventLoopUtilization(currentUtilization, utilization),
        cpuMs: {
          user: (currentCpu.user - cpu.user) / 1000,
          system: (currentCpu.system - cpu.system) / 1000,
        },
        rssBytes: process.memoryUsage.rss(),
        inFlightRequests,
        database: { poolMaxConnections },
      };
      if (reset) {
        delay.reset();
        startedAt = now;
        utilization = currentUtilization;
        cpu = currentCpu;
      }
      return result;
    },
    close() {
      delay.disable();
    },
  };
}

export type RuntimeMetrics = NonNullable<ReturnType<typeof createRuntimeMetrics>>;

export function installRuntimeMetrics(app: Hono, metrics?: RuntimeMetrics) {
  if (!metrics) return;
  app.use("*", metrics.middleware);
  app.get("/internal/metrics", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(metrics.read(c.req.query("reset") === "1"));
  });
}
