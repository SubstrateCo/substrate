import { flows } from "./flows/index.ts";
import { config } from "./lib/config.ts";
import { runBackfillStep, runSession } from "./lib/session.ts";
import { reportingThresholds, summarize } from "./lib/summary.ts";
import type { Options } from "k6/options";

const flowNames = flows.map((flow) => flow.name);

function scenario(): NonNullable<Options["scenarios"]>[string] {
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
  thresholds: reportingThresholds(flowNames),
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
  // Backfill keeps one sign-in per VU across iterations; sessions reset cookies per iteration.
  noCookiesReset: config.mode === "backfill",
  discardResponseBodies: false,
};

export default async function () {
  if (config.mode === "backfill") await runBackfillStep(flows);
  else await runSession(flows);
}

export function handleSummary(data: Parameters<typeof summarize>[0]) {
  return summarize(data, flowNames);
}
