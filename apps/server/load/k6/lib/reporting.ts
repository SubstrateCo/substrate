import { endpointNames, failureCodes } from "./endpoints.ts";

interface ThresholdConfig {
  mode: string;
  vus: number;
  onlyFlows?: string[];
  realtime: boolean;
  apiP95Ms: number;
  apiP99Ms: number;
}

interface ReportingThresholds {
  [metric: string]: string[];
}

/** Reporting submetrics are separate from the suite's acceptance gates. */
export function reportingThresholds(
  flowNames: string[],
  config: ThresholdConfig,
  observationValues: Record<string, readonly string[]> = {},
) {
  const thresholds: ReportingThresholds = {
    api_calls: ["count>0"],
    api_failures: ["count==0"],
    api_duration: [`p(95)<${config.apiP95Ms}`, `p(99)<${config.apiP99Ms}`],
    flow_completed: ["count>0"],
    flow_failed: ["count==0"],
    ws_drops: ["count==0"],
    session_errors: ["count==0"],
  };
  if (config.mode === "coverage") thresholds.coverage_sessions_completed = [`count==${config.vus}`];
  if (config.realtime) thresholds.ws_ready = ["count>0"];
  for (const endpoint of endpointNames) {
    thresholds[`api_calls{endpoint:${endpoint}}`] = ["count>=0"];
    thresholds[`api_duration{endpoint:${endpoint}}`] = ["max>=0"];
    for (const code of failureCodes)
      thresholds[`api_failures{endpoint:${endpoint},code:${code}}`] = ["count>=0"];
  }
  for (const flow of flowNames) {
    const required =
      (config.mode === "coverage" || config.mode === "measure") &&
      (!config.onlyFlows || config.onlyFlows.includes(flow));
    thresholds[`flow_duration{flow:${flow}}`] = ["max>=0"];
    thresholds[`flow_completed{flow:${flow}}`] = [required ? "count>0" : "count>=0"];
    thresholds[`flow_failed{flow:${flow}}`] = ["count==0"];
    thresholds[`flow_skipped{flow:${flow}}`] = ["count>=0"];
  }
  for (const cause of ["mount", "hint", "ready", "reconcile", "mutation"])
    thresholds[`cache_refetches{cause:${cause}}`] = ["count>=0"];
  for (const [dimension, values] of Object.entries(observationValues))
    for (const value of values)
      thresholds[`workload_observations{dimension:${dimension},value:${value}}`] = ["count>=0"];
  return thresholds;
}

export interface MetricData {
  values: Record<string, number>;
  thresholds?: Record<string, { ok: boolean }>;
}

export function failedThresholds(
  metrics: Record<string, MetricData | undefined>,
  expected: Record<string, string[]> = {},
) {
  const failures = Object.entries(metrics).flatMap(([metric, data]) =>
    Object.entries(data?.thresholds ?? {}).flatMap(([threshold, result]) =>
      result.ok ? [] : [{ metric, threshold }],
    ),
  );
  for (const [metric, thresholds] of Object.entries(expected))
    for (const threshold of thresholds) {
      if (threshold === "count>=0" || threshold === "max>=0") continue;
      if (!metrics[metric]?.thresholds?.[threshold]) failures.push({ metric, threshold });
    }
  return failures;
}
