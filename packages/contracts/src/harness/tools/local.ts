import { id, requestId, timestamp } from "./shared.ts";
import { z } from "zod";

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
