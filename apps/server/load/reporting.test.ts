import { failedThresholds, reportingThresholds } from "./k6/lib/reporting.ts";
import { describe, expect, test } from "bun:test";

const config = { mode: "measure", vus: 200, realtime: true, apiP95Ms: 1000, apiP99Ms: 3000 };

describe("load acceptance thresholds", () => {
  test("gates API errors, latency, flow errors, coverage and socket health", () => {
    const thresholds = reportingThresholds(["tasks", "crm"], config);
    expect(thresholds.api_failures).toEqual(["count==0"]);
    expect(thresholds.api_duration).toEqual(["p(95)<1000", "p(99)<3000"]);
    expect(thresholds.flow_failed).toEqual(["count==0"]);
    expect(thresholds["flow_completed{flow:crm}"]).toEqual(["count>0"]);
    expect(thresholds.ws_drops).toEqual(["count==0"]);
    expect(thresholds.ws_ready).toEqual(["count>0"]);
    expect(thresholds.session_errors).toEqual(["count==0"]);
  });

  test("coverage requires every configured session to finish, not just aggregate flow coverage", () => {
    const thresholds = reportingThresholds(["tasks"], { ...config, mode: "coverage", vus: 8 });
    expect(thresholds.coverage_sessions_completed).toEqual(["count==8"]);
    expect(thresholds.session_errors).toEqual(["count==0"]);
    expect(reportingThresholds(["tasks"], config).coverage_sessions_completed).toBeUndefined();
    const incomplete = {
      coverage_sessions_completed: {
        values: { count: 7 },
        thresholds: { "count==8": { ok: false } },
      },
    };
    expect(failedThresholds(incomplete, { coverage_sessions_completed: ["count==8"] })).toEqual([
      { metric: "coverage_sessions_completed", threshold: "count==8" },
    ]);
  });

  test("session exceptions fail acceptance even when API and flow gates pass", () => {
    const metrics = {
      api_failures: { values: { count: 0 }, thresholds: { "count==0": { ok: true } } },
      flow_failed: { values: { count: 0 }, thresholds: { "count==0": { ok: true } } },
      session_errors: { values: { count: 1 }, thresholds: { "count==0": { ok: false } } },
    };
    expect(failedThresholds(metrics)).toEqual([
      { metric: "session_errors", threshold: "count==0" },
    ]);
  });

  test("coverage requires completion even when a flow ran but skipped its work", () => {
    const thresholds = reportingThresholds(["tasks"], { ...config, mode: "coverage" });
    expect(thresholds["flow_completed{flow:tasks}"]).toEqual(["count>0"]);
    expect(thresholds["flow_skipped{flow:tasks}"]).toEqual(["count>=0"]);
  });

  test("targeted runs do not require excluded features or backfill sockets", () => {
    const thresholds = reportingThresholds(["tasks", "crm"], { ...config, onlyFlows: ["tasks"] });
    expect(thresholds["flow_completed{flow:crm}"]).toEqual(["count>=0"]);
    expect(thresholds["flow_completed{flow:tasks}"]).toEqual(["count>0"]);
    expect(
      reportingThresholds(["tasks"], { ...config, mode: "backfill", realtime: false }).ws_ready,
    ).toBeUndefined();
  });

  test("reports failed gates and rejects absent acceptance evidence", () => {
    const metrics = {
      api_failures: { values: { count: 1 }, thresholds: { "count==0": { ok: false } } },
      ws_drops: { values: { count: 0 }, thresholds: { "count==0": { ok: true } } },
    };
    expect(failedThresholds(metrics, { api_duration: ["p(95)<1000"] })).toEqual([
      { metric: "api_failures", threshold: "count==0" },
      { metric: "api_duration", threshold: "p(95)<1000" },
    ]);
  });

  test("passes only when every supplied acceptance gate has successful evidence", () => {
    const metrics = {
      api_failures: { values: { count: 0 }, thresholds: { "count==0": { ok: true } } },
      flow_completed: { values: { count: 8 }, thresholds: { "count>0": { ok: true } } },
    };
    expect(
      failedThresholds(metrics, { api_failures: ["count==0"], flow_completed: ["count>0"] }),
    ).toEqual([]);
    expect(failedThresholds({}, { flow_completed: ["count>0"] })).toEqual([
      { metric: "flow_completed", threshold: "count>0" },
    ]);
  });

  test("bounded observation buckets are reported without adding coverage gates", () => {
    const thresholds = reportingThresholds(["tasks"], config, { organization: ["small", "large"] });
    expect(thresholds["workload_observations{dimension:organization,value:small}"]).toEqual([
      "count>=0",
    ]);
    expect(thresholds["workload_observations{dimension:organization,value:large}"]).toEqual([
      "count>=0",
    ]);
  });
});
