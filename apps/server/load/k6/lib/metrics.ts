import { Counter, Trend } from "k6/metrics";

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

// Realtime model. Tag on refetches: cause = mount | hint | ready | reconcile | mutation.
export const wsReady = new Counter("ws_ready");
export const wsDrops = new Counter("ws_drops");
export const wsHints = new Counter("ws_hints");
export const refetches = new Counter("cache_refetches");
