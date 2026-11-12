import { userOf } from "./data.ts";
import { Rng } from "./random.ts";

export type FlowName =
  | "readMessages"
  | "writeMessages"
  | "tasks"
  | "search"
  | "notifications"
  | "connectedWork"
  | "crm"
  | "rare";

type Role = "chatty" | "taskFocused" | "lurker" | "balanced";

export interface Persona {
  role: Role;
  /** Relative activity, log-normal around 1: a few heavy users, many light ones. */
  activity: number;
  /** Multiplies every pause. Heavy users move faster. */
  tempo: number;
  typingCps: number;
  readingCps: number;
  /** Chance of a break between two flows. */
  awayChance: number;
  /** Multipliers on the base flow weights. */
  flowBias: Record<FlowName, number>;
}

const roles: { role: Role; share: number; bias: Partial<Record<FlowName, number>> }[] = [
  { role: "chatty", share: 0.25, bias: { writeMessages: 2.2, readMessages: 1.1, tasks: 0.5 } },
  { role: "taskFocused", share: 0.25, bias: { tasks: 2.5, writeMessages: 0.6, readMessages: 0.7 } },
  {
    role: "lurker",
    share: 0.2,
    bias: { readMessages: 1.5, writeMessages: 0.25, tasks: 0.5, search: 1.3, notifications: 1.3 },
  },
  { role: "balanced", share: 0.3, bias: {} },
];

const flowNames: FlowName[] = [
  "readMessages",
  "writeMessages",
  "tasks",
  "search",
  "notifications",
  "connectedWork",
  "crm",
  "rare",
];

// Each VU runs in its own JS runtime, so module state is per VU. __VU is 0 in the setup runtime.
const user = userOf(Math.max(__VU, 1));

/** The VU's seeded random source. Flows use it instead of Math.random. */
export const rng = new Rng(user.email);

function createPersona(): Persona {
  const { role, bias } = rng.weighted(roles, (entry) => entry.share)!;
  const activity = rng.logNormal(1, 0.7, 0.2, 5);
  return {
    role,
    activity,
    tempo: Math.pow(activity, -0.35),
    typingCps: rng.between(4, 7),
    // Chat is read faster than prose: short lines, much of it skimmed.
    readingCps: rng.between(25, 45),
    awayChance: Math.min(0.25, 0.1 / Math.sqrt(activity)),
    // SAFETY: every FlowName in flowNames is assigned a numeric weight.
    flowBias: Object.fromEntries(flowNames.map((name) => [name, bias[name] ?? 1])) as Record<
      FlowName,
      number
    >,
  };
}

export const persona = createPersona();
