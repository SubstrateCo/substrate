import { averageSignedInUsers, estimateActiveFraction, rankUsers } from "../../workload.ts";
import { config } from "./config.ts";
import { organizations, users } from "./data.ts";
import { endpointNames, failureCodes } from "./endpoints.ts";
import { failedThresholds, reportingThresholds, type MetricData } from "./reporting.ts";

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
export function summarize(
  data: SummaryData,
  flowNames: string[],
  observationValues: Record<string, readonly string[]> = {},
) {
  const seconds = data.state.testRunDurationMs / 1000;
  const endpoints = endpointRows(data);
  const flows = flowNames.flatMap((flow) => {
    const row = {
      flow,
      runs: value(data, `flow_duration{flow:${flow}}`, "count"),
      completed: value(data, `flow_completed{flow:${flow}}`, "count"),
      failed: value(data, `flow_failed{flow:${flow}}`, "count"),
      skipped: value(data, `flow_skipped{flow:${flow}}`, "count"),
      p50: value(data, `flow_duration{flow:${flow}}`, "med"),
    };
    return [row];
  });
  const calls = value(data, "api_calls", "count");
  const sessionPresenceMs = value(data, "session_presence_ms", "count");
  const expectedActiveFraction =
    config.mode === "measure"
      ? estimateActiveFraction(
          rankUsers([...users], organizations).slice(0, config.vus),
          organizations,
        )
      : null;
  const totals = {
    seconds,
    accountSlots: config.vus,
    sessionPresenceMs,
    averageSignedInUsers: averageSignedInUsers(sessionPresenceMs, data.state.testRunDurationMs),
    expectedSteadyStateActiveFraction: expectedActiveFraction,
    expectedSteadyStateSignedInUsers:
      expectedActiveFraction === null ? null : config.vus * expectedActiveFraction,
    calls,
    callsPerSecond: seconds > 0 ? calls / seconds : 0,
    failures: value(data, "api_failures", "count"),
    writes: value(data, "writes", "count"),
    writesPerSecond: seconds > 0 ? value(data, "writes", "count") / seconds : 0,
    completed: value(data, "flow_completed", "count"),
    failed: value(data, "flow_failed", "count"),
    skipped: value(data, "flow_skipped", "count"),
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
  const failures = failedThresholds(
    data.metrics,
    reportingThresholds(flowNames, config, observationValues),
  );
  const observed = Object.fromEntries(
    Object.entries(observationValues).map(([dimension, values]) => [
      dimension,
      Object.fromEntries(
        values.map((label) => [
          label,
          value(data, `workload_observations{dimension:${dimension},value:${label}}`, "count"),
        ]),
      ),
    ]),
  );
  const text = [
    `\nmode=${config.mode} vus=${config.vus} pace=${config.pace} duration=${seconds.toFixed(0)}s`,
    `presence: account slots=${config.vus}; measured mean signed-in users=${totals.averageSignedInUsers.toFixed(2)}; expected steady-state mean=${totals.expectedSteadyStateSignedInUsers?.toFixed(2) ?? "n/a"} (not a constant-active-user test; interrupted sessions lose at most the final 1s checkpoint)`,
    `calls=${calls} (${totals.callsPerSecond.toFixed(1)}/s) failures=${totals.failures} writes=${totals.writes} (${totals.writesPerSecond.toFixed(1)}/s)`,
    `socket: ready=${totals.wsReady} drops=${totals.wsDrops} hints=${totals.wsHints}; refetches ${JSON.stringify(totals.refetches)}`,
    `verdict=${failures.length ? "FAIL" : "PASS"} failed thresholds=${JSON.stringify(failures)}`,
    `observed visits (not unique identities): ${JSON.stringify(observed)}`,
    ...(config.mode === "coverage"
      ? [
          "Rare action observations are attempts, not completions; omitted means its access/state predicate was false. Other prerequisite early returns are not proof of completed branch coverage.",
        ]
      : []),
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
      ["flow", "runs", "completed", "failed", "skipped", "p50 s"],
      flows.map((row) => [
        row.flow,
        String(row.runs),
        String(row.completed),
        String(row.failed),
        String(row.skipped),
        (row.p50 / 1000).toFixed(1),
      ]),
    ),
    "",
  ].join("\n");
  const report = {
    mode: config.mode,
    config,
    verdict: failures.length ? "FAIL" : "PASS",
    failedThresholds: failures,
    totals,
    endpoints,
    flows,
    observed,
    metrics: data.metrics,
  };
  return {
    stdout: text,
    // handleSummary paths are relative to the working directory: run k6 from the repo root.
    [`apps/server/load/.data/k6-summary-${config.mode}.json`]: JSON.stringify(report, null, 2),
  };
}
