import { routineFields } from "../../agent-work/routines.ts";
import { helperStatuses } from "../../agent-work/turns.ts";
import { id, requestId, timestamp } from "./shared.ts";
import { z } from "zod";

const place = z
  .object({ conversationId: id, threadId: id.nullable() })
  .strict()
  .nullable()
  .describe(
    "Where each run posts: a conversation your owner can see, and optionally the root message of a thread in it. Null posts in your owner's direct message with you.",
  );

/** The routine fields an agent may set. */
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
  destination: place,
};
const routine = z.object({
  routineId: id,
  name: z.string(),
  prompt: z.string(),
  cron: z.string(),
  timezone: z.string(),
  enabled: z.boolean(),
  destination: z.object({ conversationId: id, threadId: id.nullable() }),
  approved: z
    .boolean()
    .describe("Whether your owner approved this version. Routines run only when approved."),
  nextFireAt: timestamp.nullable(),
  lastFiredAt: timestamp.nullable(),
});

const helperStatus = z.enum(helperStatuses);

/**
 * Tools that manage the agent's own routines and helpers. They change only the agent's own work,
 * so they never wait for approval. Routine changes run only in interactive turns.
 */
export const agentWorkTools = {
  start_helper: {
    title: "Start helper",
    description:
      "Start a helper agent in its own folder for a separate, self-contained task. It cannot post messages. Its report comes back to you as a new item when it finishes. At most 2 helpers run at a time.",
    readOnly: false,
    idempotent: true,
    ownWork: true,
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
    description:
      "Send more instructions to a running helper. The helper reads them in its next turn, after the turn it runs now.",
    readOnly: false,
    ownWork: true,
    input: z.object({ helperId: id, text: z.string().trim().min(1).max(8000) }).strict(),
    output: z.object({ delivered: z.literal("queued") }),
  },
  stop_helper: {
    title: "Stop helper",
    description: "Stop a running helper. Its report, if any, stays available in list_helpers.",
    readOnly: false,
    ownWork: true,
    input: z.object({ helperId: id }).strict(),
    output: z.object({ helperId: id, status: helperStatus }),
  },
  finish_helper: {
    title: "Finish helper",
    description:
      "Helpers only. Report your result to the agent that started you, then end your turn.",
    readOnly: false,
    idempotent: true,
    ownWork: true,
    input: z.object({ report: z.string().trim().min(1).max(20000) }).strict(),
    output: z.object({ saved: z.literal(true) }),
  },
  list_routines: {
    title: "List routines",
    description:
      "List your routines: scheduled work that starts a background turn and posts to the routine's destination.",
    readOnly: true,
    input: z.object({}).strict(),
    output: z.object({ items: z.array(routine) }),
  },
  create_routine: {
    title: "Create routine",
    description:
      "Create a routine for scheduled work. It runs from its next scheduled time once your owner approves it. Check list_routines first so you do not create a duplicate. Interactive turns only.",
    readOnly: false,
    liveTurnOnly: true,
    input: z
      .object({
        ...routineInput,
        enabled: routineInput.enabled.default(true),
        destination: routineInput.destination.default(null),
      })
      .strict(),
    output: routine,
  },
  update_routine: {
    title: "Update routine",
    description:
      "Change only the fields you supply. Changes apply from the next run; a change to what it does or where it posts waits for your owner's approval. Use enabled to pause or resume. Interactive turns only.",
    readOnly: false,
    destructive: true,
    liveTurnOnly: true,
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
    liveTurnOnly: true,
    input: z.object({ routineId: id }).strict(),
    output: z.object({ deleted: z.literal(true) }),
  },
} as const;
