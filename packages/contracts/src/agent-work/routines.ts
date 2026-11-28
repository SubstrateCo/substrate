import { knownTimeZone } from "../timestamps.ts";
import { organizationId } from "../workspace.ts";
import { z } from "zod";

const id = z.uuid();

/** The longest value each routine text field accepts. */
export const routineLimits = { name: 200, prompt: 20_000, cron: 100, timezone: 100 } as const;

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
const routineChanges = z
  .strictObject(routineFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Supply at least one change");
export const updateRoutineInput = z.strictObject({ routineId: id, changes: routineChanges });

export type CreateRoutineInput = z.input<typeof createRoutineInput>;
export type UpdateRoutineInput = z.input<typeof updateRoutineInput>;
/** The fields a routine write changes. */
export type RoutineChanges = z.output<typeof routineChanges>;

/** GET /agent-work/agents/:id/routines */
export const listRoutinesInput = z.strictObject({ organizationId });
/** POST /agent-work/routines. The owner's own routine is approved as saved. */
export const ownerCreateRoutineInput = createRoutineInput.extend({ organizationId });
/** PATCH /agent-work/routines/:id. The owner's change is approved as saved. */
export const ownerUpdateRoutineInput = z.strictObject({ organizationId, changes: routineChanges });
/** DELETE /agent-work/routines/:id */
export const ownerDeleteRoutineInput = z.strictObject({ organizationId });
/**
 * POST /agent-work/routines/:id/approve. Approves exactly this revision; a routine that changed
 * since the owner looked is a conflict.
 */
export const approveRoutineInput = z.strictObject({
  organizationId,
  revision: z.number().int().min(1),
});
export const routineParams = z.strictObject({ id });

export interface AgentRoutineView {
  id: string;
  userAgentId: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  /** Grows with each change to what the routine does or where it posts. */
  revision: number;
  /**
   * The revision the owner approved, or null. The routine runs only while this equals revision:
   * routines the agent creates or changes wait for the owner.
   */
  approvedRevision: number | null;
  /** Resolved at save time; a null input becomes the owner's direct conversation. */
  destination: { conversationId: string; threadId: string | null };
  /** Missed ticks collapse to the latest one. */
  catchUp: "latest";
  enabled: boolean;
  nextFireAt: string | null;
  lastFiredAt: string | null;
  createdAt: string;
}
