import { observationValues } from "../workload.ts";
import { flows } from "./flows/index.ts";
import { config } from "./lib/config.ts";
import {
  initializeMetrics,
  recordCoverageSessionCompleted,
  recordSessionError,
} from "./lib/metrics.ts";
import { SessionOver } from "./lib/pacing.ts";
import { reportingThresholds } from "./lib/reporting.ts";
import { runBackfillStep, runCoverage, runSession } from "./lib/session.ts";
import { summarize } from "./lib/summary.ts";
import type { Options } from "k6/options";

const flowNames = flows.map((flow) => flow.name);

function scenario(): NonNullable<Options["scenarios"]>[string] {
  if (config.mode === "coverage")
    return {
      executor: "per-vu-iterations",
      vus: config.vus,
      iterations: 1,
      maxDuration: config.duration,
    };
  if (config.mode === "backfill")
    return config.iterations
      ? {
          executor: "shared-iterations",
          vus: config.vus,
          iterations: config.iterations,
          maxDuration: "2h",
        }
      : { executor: "constant-vus", vus: config.vus, duration: config.duration };
  return {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: config.ramp, target: config.vus },
      { duration: config.duration, target: config.vus },
      // Measure sessions leave over their own 45 s jitter window, not executor interrupts.
      { duration: config.mode === "measure" ? "0s" : "20s", target: 0 },
    ],
    gracefulRampDown: config.mode === "measure" ? "60s" : "30s",
    gracefulStop: config.mode === "measure" ? "60s" : "30s",
  };
}

export const options: Options = {
  scenarios: { [config.mode]: scenario() },
  thresholds: reportingThresholds(flowNames, config, observationValues),
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
  // Backfill keeps one sign-in per VU across iterations; sessions reset cookies per iteration.
  noCookiesReset: config.mode === "backfill",
  discardResponseBodies: false,
};

export default async function () {
  initializeMetrics(flowNames);
  try {
    if (config.mode === "backfill") await runBackfillStep(flows);
    else if (config.mode === "coverage") {
      await runCoverage(flows);
      recordCoverageSessionCompleted();
    } else await runSession(flows);
  } catch (error) {
    if (!(error instanceof SessionOver)) recordSessionError();
    throw error;
  }
}

export function handleSummary(data: Parameters<typeof summarize>[0]) {
  return summarize(data, flowNames, observationValues);
}
