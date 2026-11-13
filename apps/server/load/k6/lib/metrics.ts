import { Counter, Trend } from "k6/metrics";
import { setInterval, clearInterval } from "k6/timers";

export const sessionPresenceMs = new Counter("session_presence_ms");
let presenceAt: number | undefined;
let presenceTimer: number | undefined;

function flushPresence() {
  if (presenceAt === undefined) return;
  const now = Date.now();
  sessionPresenceMs.add(Math.max(0, now - presenceAt));
  presenceAt = now;
}

export function startPresence() {
  stopPresence();
  presenceAt = Date.now();
  // Flush during sessions as well as on sign-out, including executor-interrupted sessions.
  presenceTimer = setInterval(flushPresence, 1000);
}

export function stopPresence() {
  flushPresence();
  if (presenceTimer !== undefined) clearInterval(presenceTimer);
  presenceAt = presenceTimer = undefined;
}

// Tags: endpoint (and code on failures). main.ts declares one submetric per tag value, so the
// summary can report each one.
export const apiCalls = new Counter("api_calls");
export const apiFailures = new Counter("api_failures");
export const apiDuration = new Trend("api_duration", true);
/** Successful writes (endpoints marked `write`), for the backfill write rate. */
export const writes = new Counter("writes");

// Tag: flow.
export const flowRuns = new Counter("flow_runs");
export const flowDuration = new Trend("flow_duration", true);
export const flowCompleted = new Counter("flow_completed");
export const flowFailed = new Counter("flow_failed");
export const flowSkipped = new Counter("flow_skipped");

let failureCount = 0;

export const coverageSessionsCompleted = new Counter("coverage_sessions_completed");
export const sessionErrors = new Counter("session_errors");

/** Call only after all coverage flows and session cleanup finish successfully. */
export function recordCoverageSessionCompleted() {
  coverageSessionsCompleted.add(1);
}

export function recordSessionError() {
  sessionErrors.add(1);
}

/** Record an unexpected API failure, including failures swallowed by a flow. */
export function recordApiFailure(endpoint: string, code: string) {
  failureCount++;
  apiFailures.add(1, { endpoint, code });
}

export function beginFlow(flow: string) {
  flowCompleted.add(0, { flow });
  flowFailed.add(0, { flow });
  flowSkipped.add(0, { flow });
  return { started: Date.now(), failures: failureCount };
}

/** Seed zero counters so an error-free run still exposes its acceptance metrics. */
export function initializeMetrics(flows: readonly string[]) {
  coverageSessionsCompleted.add(0);
  sessionErrors.add(0);
  sessionPresenceMs.add(0);
  apiFailures.add(0);
  wsDrops.add(0);
  wsReady.add(0);
  for (const flow of flows) {
    flowCompleted.add(0, { flow });
    flowFailed.add(0, { flow });
    flowSkipped.add(0, { flow });
  }
}

export type FlowOutcome = "completed" | "failed" | "skipped";

export function endFlow(flow: string, token: ReturnType<typeof beginFlow>, outcome: FlowOutcome) {
  const result = failureCount > token.failures ? "failed" : outcome;
  const tags = { flow };
  flowRuns.add(1, tags);
  flowDuration.add(Date.now() - token.started, tags);
  if (result === "failed") flowFailed.add(1, tags);
  else if (result === "skipped") flowSkipped.add(1, tags);
  else flowCompleted.add(1, tags);
  return result;
}

export function recordFlowSkip(flow: string) {
  flowSkipped.add(1, { flow });
}

/** Counts visits, not unique identities. Values must come from bounded workload cohorts. */
export const observations = new Counter("workload_observations");
export function recordObservation(dimension: string, value: string) {
  observations.add(1, { dimension, value });
}

// Realtime model. Tag on refetches: cause = mount | hint | ready | reconcile | mutation.
export const wsReady = new Counter("ws_ready");
export const wsDrops = new Counter("ws_drops");
export const wsHints = new Counter("ws_hints");
export const refetches = new Counter("cache_refetches");
