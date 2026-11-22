import type { MiddlewareHandler } from "hono";
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
      const loop = performance.eventLoopUtilization(currentUtilization, utilization);
      const result = {
        windowMs: now - startedAt,
        eventLoopDelayMs: {
          p50: delay.percentile(50) / 1e6,
          p95: delay.percentile(95) / 1e6,
          p99: delay.percentile(99) / 1e6,
          max: delay.count ? delay.max / 1e6 : 0,
        },
        // Bun currently returns all zeros for this API. Do not report that as an idle loop.
        eventLoopUtilization: loop.active + loop.idle > 0 ? loop : null,
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
