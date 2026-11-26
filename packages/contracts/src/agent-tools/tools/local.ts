import { z } from "zod";

/** Tools the agent's host handles itself. Their calls never reach the server. */
export const localTools = {
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
} as const;
