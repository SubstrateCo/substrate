import { knownTimeZone } from "../timestamps.ts";
import { z } from "zod";

const id = z.uuid();

/** The longest value each routine text field accepts. */
export const routineLimits = { name: 200, prompt: 20_000, cron: 100, timezone: 100 } as const;

/** Five cron fields: minute hour day-of-month month day-of-week. */
const cron = z
  .string()
  .trim()
  .max(routineLimits.cron)
  .regex(/^\S+(\s+\S+){4}$/, "Use five cron fields: minute hour day month weekday");

const timezone = z
  .string()
  .min(1)
  .max(routineLimits.timezone)
  .refine(knownTimeZone, "Unknown time zone");

export const routineFields = {
  name: z.string().trim().min(1).max(routineLimits.name),
  prompt: z.string().trim().min(1).max(routineLimits.prompt),
  cron,
  timezone,
  /** Null posts to the owner's direct conversation with the agent. */
  destination: z.strictObject({ conversationId: id, threadId: id.nullable() }).nullable(),
  enabled: z.boolean(),
};

export const createRoutineInput = z.strictObject({ agentId: id, ...routineFields });
export const updateRoutineInput = z.strictObject({
  routineId: id,
  changes: z
    .strictObject(routineFields)
    .partial()
    .refine((value) => Object.keys(value).length > 0, "Supply at least one change"),
});
export const deleteRoutineInput = z.strictObject({ routineId: id });

export type CreateRoutineInput = z.input<typeof createRoutineInput>;
export type UpdateRoutineInput = z.input<typeof updateRoutineInput>;

export interface AgentRoutineView {
  id: string;
  userAgentId: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  /** Grows with each change to what the routine does or where it posts. */
  revision: number;
  /** Resolved at save time; a null input becomes the owner's direct conversation. */
  destination: { conversationId: string; threadId: string | null };
  /** Missed ticks collapse to the latest one. */
  catchUp: "latest";
  enabled: boolean;
  nextFireAt: string | null;
  lastFiredAt: string | null;
  createdAt: string;
}
