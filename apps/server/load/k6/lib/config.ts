type Mode = "smoke" | "backfill" | "measure" | "warmup" | "coverage";

const modes: Record<Mode, { vus: number; ramp: string; duration: string; pace: number }> = {
  smoke: { vus: 5, ramp: "10s", duration: "1m", pace: 1 },
  backfill: { vus: 40, ramp: "10s", duration: "5m", pace: 0 },
  measure: { vus: 200, ramp: "2m", duration: "12m", pace: 1 },
  warmup: { vus: 20, ramp: "30s", duration: "2m", pace: 1 },
  coverage: { vus: 8, ramp: "0s", duration: "10m", pace: 0 },
};

function parseMode(value: string | undefined): Mode {
  const mode = value ?? "smoke";
  switch (mode) {
    case "smoke":
    case "backfill":
    case "measure":
    case "warmup":
    case "coverage":
      return mode;
  }
  throw new Error(`MODE must be smoke, backfill, measure, warmup or coverage, not ${mode}.`);
}

/** Parses k6-style durations such as "90s", "2m" or "1h30m" to milliseconds. */
function durationMs(text: string) {
  const parts = text.match(/\d+(\.\d+)?(ms|s|m|h)/g);
  if (!parts || parts.join("") !== text) throw new Error(`Invalid duration: ${text}`);
  const unit = new Map([
    ["ms", 1],
    ["s", 1000],
    ["m", 60_000],
    ["h", 3_600_000],
  ]);
  return parts.reduce((total, part) => {
    const [, amount, suffix] = part.match(/^([\d.]+)(ms|s|m|h)$/)!;
    return total + Number(amount) * unit.get(suffix!)!;
  }, 0);
}

const mode = parseMode(__ENV.MODE);
const defaults = modes[mode];

export const config = {
  mode,
  vus: Number(__ENV.VUS ?? defaults.vus),
  ramp: __ENV.RAMP ?? defaults.ramp,
  duration: __ENV.DURATION ?? defaults.duration,
  /** Think-time multiplier: 1 is natural, 0 removes pauses. */
  pace: Number(__ENV.PACE ?? defaults.pace),
  /** Backfill only: total flow runs shared by all VUs, instead of a duration. */
  iterations: __ENV.ITERATIONS ? Number(__ENV.ITERATIONS) : undefined,
  /** Comma-separated flow names to run alone, for developing one flow. Unset runs all. */
  onlyFlows: __ENV.FLOWS ? __ENV.FLOWS.split(",") : undefined,
  /** The VU whose request and pause timeline is printed. 0 disables it. */
  debugVu: Number(__ENV.DEBUG_VU ?? 0),
  /** The socket and the reconcile timer model the live client. Backfill only writes. */
  realtime: mode !== "backfill",
  apiP95Ms: Number(__ENV.API_P95_MS ?? 1000),
  apiP99Ms: Number(__ENV.API_P99_MS ?? 3000),
};

if (!Number.isInteger(config.vus) || config.vus < 1 || config.vus > 200)
  throw new Error("VUS must be an integer between 1 and the 200 VU ceiling.");
if (!Number.isFinite(config.pace) || config.pace < 0)
  throw new Error("PACE must be a non-negative finite number.");
for (const limit of [config.apiP95Ms, config.apiP99Ms])
  if (!Number.isFinite(limit) || limit <= 0)
    throw new Error("API latency limits must be positive finite numbers.");

/** Milliseconds from test start until the hold phase ends and sessions should wrap up. */
export const plannedEndMs = durationMs(config.ramp) + durationMs(config.duration);
