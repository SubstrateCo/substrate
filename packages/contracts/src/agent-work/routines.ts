import { z } from "zod";

const id = z.uuid();

/** Five cron fields: minute hour day-of-month month day-of-week. */
const cron = z
  .string()
  .trim()
  .max(100)
  .regex(/^\S+(\s+\S+){4}$/, "Use five cron fields: minute hour day month weekday");

/** An IANA time zone that this runtime knows, such as Europe/Berlin. */
const timezone = z
  .string()
  .min(1)
  .max(100)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone");

const routineFields = {
  name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(20_000),
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
/** Approves the routine's current revision. Edits create a new revision that needs approval. */
export const approveRoutineInput = z.strictObject({ routineId: id, revision: z.number().int() });
export const deleteRoutineInput = z.strictObject({ routineId: id });

export type CreateRoutineInput = z.input<typeof createRoutineInput>;
export type UpdateRoutineInput = z.input<typeof updateRoutineInput>;
export type ApproveRoutineInput = z.input<typeof approveRoutineInput>;

export interface AgentRoutineView {
  id: string;
  userAgentId: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  revision: number;
  /** A routine runs only while approvedRevision equals revision. */
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
