import { routineFields } from "../../agent-work/routines.ts";
import { id, requestId, timestamp } from "./shared.ts";
import { z } from "zod";

/** The routine fields an agent may set. Agent routines always post to the owner's DM. */
const routineInput = {
  name: routineFields.name,
  prompt: routineFields.prompt.describe(
    "What to do on each run. It reaches you as a routine item in a background turn.",
  ),
  cron: routineFields.cron.describe(
    'Five fields: minute hour day-of-month month day-of-week, such as "0 9 * * 1-5".',
  ),
  timezone: routineFields.timezone.describe("An IANA time zone, such as Europe/Berlin."),
  enabled: routineFields.enabled.describe("False pauses the routine without deleting it."),
};
const routine = z.object({
  routineId: id,
  name: z.string(),
  prompt: z.string(),
  cron: z.string(),
  timezone: z.string(),
  enabled: z.boolean(),
  approved: z
    .boolean()
    .describe("False until your owner approves this version. Only approved routines run."),
  nextFireAt: timestamp.nullable(),
  lastFiredAt: timestamp.nullable(),
});

const layer = z
  .enum(["profile", "log", "notes"])
  .describe(
    "profile: lasting facts about your owner and your work (kept short). log: dated record of what happened this month. notes: working notes that can expire.",
  );
const helperStatus = z.enum(["running", "finished", "failed", "stopped"]);

/** Tools the desktop handles itself. Their calls never reach the server. */
export const localTools = {
  remember: {
    title: "Remember",
    description:
      "Save a memory in your agent folder. Use profile for lasting facts (max 4000 characters in total; replace stale entries with forget first), log for a dated record of work, and notes for working notes with an optional expiry.",
    readOnly: false,
    input: z
      .object({
        layer,
        text: z.string().trim().min(1).max(4000),
        expiresAt: timestamp.optional().describe("notes only. Drop the note after this time."),
      })
      .strict(),
    output: z.object({ layer, saved: z.literal(true) }),
  },
  forget: {
    title: "Forget",
    description: "Remove memory entries in a layer that contain the given text.",
    readOnly: false,
    destructive: true,
    input: z.object({ layer, match: z.string().trim().min(1).max(500) }).strict(),
    output: z.object({ layer, removed: z.number().int() }),
  },
  save_handoff: {
    title: "Save handoff",
    description:
      "Save what the next session needs to continue this conversation: the objectives, the open work, and references to reopen. Call it once when asked to hand off.",
    readOnly: false,
    idempotent: true,
    input: z
      .object({
        objectives: z.string().trim().min(1).max(4000),
        openWork: z.string().max(8000),
        references: z
          .array(z.string().trim().min(1).max(500))
          .max(50)
          .describe("Record IDs, links or file paths to reopen."),
      })
      .strict(),
    output: z.object({ saved: z.literal(true) }),
  },
  start_helper: {
    title: "Start helper",
    description:
      "Start a helper agent in its own folder for a separate, self-contained task. It cannot post messages. Its report comes back to you as a new item when it finishes. At most 2 helpers run at a time.",
    readOnly: false,
    idempotent: true,
    input: z
      .object({
        requestId,
        task: z
          .string()
          .trim()
          .min(1)
          .max(8000)
          .describe("Everything the helper needs: the goal, the context and the expected report."),
      })
      .strict(),
    output: z.object({ helperId: id, status: helperStatus }),
  },
  list_helpers: {
    title: "List helpers",
    description: "List your helpers in this session, newest first, with their reports.",
    readOnly: true,
    input: z.object({}).strict(),
    output: z.object({
      items: z.array(
        z.object({
          helperId: id,
          task: z.string(),
          status: helperStatus,
          report: z.string().nullable(),
          createdAt: timestamp,
        }),
      ),
    }),
  },
  message_helper: {
    title: "Message helper",
    description: "Send more instructions to a running helper.",
    readOnly: false,
    input: z.object({ helperId: id, text: z.string().trim().min(1).max(8000) }).strict(),
    output: z.object({ delivered: z.enum(["steered", "queued"]) }),
  },
  stop_helper: {
    title: "Stop helper",
    description: "Stop a running helper. Its report, if any, stays available in list_helpers.",
    readOnly: false,
    input: z.object({ helperId: id }).strict(),
    output: z.object({ helperId: id, status: helperStatus }),
  },
  list_routines: {
    title: "List routines",
    description:
      "List your routines: scheduled work that starts a background turn and posts in your owner's direct message with you.",
    readOnly: true,
    input: z.object({}).strict(),
    output: z.object({ items: z.array(routine) }),
  },
  create_routine: {
    title: "Create routine",
    description:
      "Create a routine for scheduled work. It runs only after your owner approves it in your Routines settings, so tell them it is waiting. Check list_routines first so you do not create a duplicate. Interactive turns only.",
    readOnly: false,
    input: z.object({ ...routineInput, enabled: routineInput.enabled.default(true) }).strict(),
    output: routine,
  },
  update_routine: {
    title: "Update routine",
    description:
      "Change only the fields you supply. A new name, prompt, schedule or time zone stops the routine until your owner approves the change; tell them. Pausing or resuming with enabled needs no approval. Interactive turns only.",
    readOnly: false,
    destructive: true,
    input: z
      .object({
        routineId: id,
        changes: z
          .object(routineInput)
          .partial()
          .strict()
          .refine((value) => Object.keys(value).length > 0, "Supply at least one change"),
      })
      .strict(),
    output: routine,
  },
  delete_routine: {
    title: "Delete routine",
    description:
      "Delete one of your routines. Its future runs stop and a queued run is dropped. Work it already did stays. Interactive turns only.",
    readOnly: false,
    destructive: true,
    input: z.object({ routineId: id }).strict(),
    output: z.object({ deleted: z.literal(true) }),
  },
  finish_helper: {
    title: "Finish helper",
    description:
      "Helpers only. Report your result to the agent that started you, then end your turn.",
    readOnly: false,
    idempotent: true,
    input: z.object({ report: z.string().trim().min(1).max(20000) }).strict(),
    output: z.object({ saved: z.literal(true) }),
  },
} as const;
