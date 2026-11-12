type Mode = "smoke" | "backfill" | "measure";

const modes: Record<Mode, { vus: number; ramp: string; duration: string; pace: number }> = {
  smoke: { vus: 5, ramp: "10s", duration: "1m", pace: 1 },
  backfill: { vus: 40, ramp: "10s", duration: "5m", pace: 0 },
  measure: { vus: 200, ramp: "2m", duration: "12m", pace: 1 },
};

function parseMode(value: string | undefined): Mode {
  const mode = value ?? "smoke";
  if (mode === "smoke" || mode === "backfill" || mode === "measure") return mode;
  throw new Error(`MODE must be smoke, backfill or measure, not ${mode}.`);
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
};

/** Milliseconds from test start until the hold phase ends and sessions should wrap up. */
export const plannedEndMs = durationMs(config.ramp) + durationMs(config.duration);
