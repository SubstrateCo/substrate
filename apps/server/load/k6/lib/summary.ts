import { config } from "./config.ts";
import { endpointNames, failureCodes } from "./endpoints.ts";

/**
 * k6 reports a tag's values in the summary only as threshold submetrics. These always pass:
 * they are reporting aids and never stop the run.
 */
export function reportingThresholds(flowNames: string[]) {
  const thresholds: Record<string, string[]> = {};
  for (const endpoint of endpointNames) {
    thresholds[`api_calls{endpoint:${endpoint}}`] = ["count>=0"];
    thresholds[`api_duration{endpoint:${endpoint}}`] = ["max>=0"];
    for (const code of failureCodes)
      thresholds[`api_failures{endpoint:${endpoint},code:${code}}`] = ["count>=0"];
  }
  for (const flow of flowNames) thresholds[`flow_duration{flow:${flow}}`] = ["max>=0"];
  for (const cause of ["mount", "hint", "ready", "reconcile", "mutation"])
    thresholds[`cache_refetches{cause:${cause}}`] = ["count>=0"];
  return thresholds;
}

interface MetricData {
  values: Record<string, number>;
}
interface SummaryData {
  metrics: Record<string, MetricData | undefined>;
  state: { testRunDurationMs: number };
}

const value = (data: SummaryData, name: string, stat: string) =>
  data.metrics[name]?.values[stat] ?? 0;
const ms = (n: number) => `${Math.round(n)}`;

function endpointRows(data: SummaryData) {
  return endpointNames
    .map((endpoint) => {
      const failures = failureCodes
        .map((code) => ({
          code,
          count: value(data, `api_failures{endpoint:${endpoint},code:${code}}`, "count"),
        }))
        .filter((failure) => failure.count > 0);
      const duration = `api_duration{endpoint:${endpoint}}`;
      return {
        endpoint,
        calls: value(data, `api_calls{endpoint:${endpoint}}`, "count"),
        failures: failures.reduce((sum, failure) => sum + failure.count, 0),
        codes: Object.fromEntries(failures.map((failure) => [failure.code, failure.count])),
        p50: value(data, duration, "med"),
        p90: value(data, duration, "p(90)"),
        p95: value(data, duration, "p(95)"),
        p99: value(data, duration, "p(99)"),
        max: value(data, duration, "max"),
      };
    })
    .filter((row) => row.calls > 0)
    .sort((a, b) => b.calls - a.calls);
}

function table(headers: string[], rows: string[][]) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]!.length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, index) =>
        index === 0 ? cell.padEnd(widths[index]!) : cell.padStart(widths[index]!),
      )
      .join("  ");
  return [line(headers), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join(
    "\n",
  );
}

/** A compact per-endpoint table on stdout, and the same data as JSON in .data/. */
export function summarize(data: SummaryData, flowNames: string[]) {
  const seconds = data.state.testRunDurationMs / 1000;
  const endpoints = endpointRows(data);
  const flows = flowNames.flatMap((flow) => {
    const row = {
      flow,
      runs: value(data, `flow_duration{flow:${flow}}`, "count"),
      p50: value(data, `flow_duration{flow:${flow}}`, "med"),
    };
    return row.runs > 0 ? [row] : [];
  });
  const calls = value(data, "api_calls", "count");
  const totals = {
    seconds,
    calls,
    callsPerSecond: calls / seconds,
    failures: value(data, "api_failures", "count"),
    writes: value(data, "writes", "count"),
    writesPerSecond: value(data, "writes", "count") / seconds,
    wsReady: value(data, "ws_ready", "count"),
    wsDrops: value(data, "ws_drops", "count"),
    wsHints: value(data, "ws_hints", "count"),
    refetches: Object.fromEntries(
      ["mount", "hint", "ready", "reconcile", "mutation"].map((cause) => [
        cause,
        value(data, `cache_refetches{cause:${cause}}`, "count"),
      ]),
    ),
  };
  const text = [
    `\nmode=${config.mode} vus=${config.vus} pace=${config.pace} duration=${seconds.toFixed(0)}s`,
    `calls=${calls} (${totals.callsPerSecond.toFixed(1)}/s) failures=${totals.failures} writes=${totals.writes} (${totals.writesPerSecond.toFixed(1)}/s)`,
    `socket: ready=${totals.wsReady} drops=${totals.wsDrops} hints=${totals.wsHints}; refetches ${JSON.stringify(totals.refetches)}`,
    "",
    table(
      [
        "endpoint",
        "calls",
        "fail",
        "p50 ms",
        "p90 ms",
        "p95 ms",
        "p99 ms",
        "max ms",
        "failure codes",
      ],
      endpoints.map((row) => [
        row.endpoint,
        String(row.calls),
        String(row.failures),
        ms(row.p50),
        ms(row.p90),
        ms(row.p95),
        ms(row.p99),
        ms(row.max),
        Object.entries(row.codes)
          .map(([code, count]) => `${code}x${count}`)
          .join(" "),
      ]),
    ),
    "",
    table(
      ["flow", "runs", "p50 s"],
      flows.map((row) => [row.flow, String(row.runs), (row.p50 / 1000).toFixed(1)]),
    ),
    "",
  ].join("\n");
  const report = { mode: config.mode, config, totals, endpoints, flows, metrics: data.metrics };
  return {
    stdout: text,
    // handleSummary paths are relative to the working directory: run k6 from the repo root.
    [`apps/server/load/.data/k6-summary-${config.mode}.json`]: JSON.stringify(report, null, 2),
  };
}
