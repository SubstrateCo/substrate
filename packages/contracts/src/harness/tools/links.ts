import { actor, excerpt, id, messageRef, page, pageInput, timestamp, workRef } from "./shared.ts";
import { z } from "zod";

export const linkKinds = ["origin", "mention", "attachment"] as const;
const link = { messageId: id, target: workRef };

export const linkTools = {
  list_links: {
    title: "List links",
    description:
      "List links between messages and a task or project, newest first. Give a task or project to find related messages, or a message to find related work. kind: origin = the task was created from the message; mention = the message text names the record; attachment = someone linked them by hand. Linking never grants access. For a task's parent, subtasks or project, use get_task or list_tasks.",
    readOnly: true,
    input: z
      .object({
        target: z.discriminatedUnion("type", [
          ...workRef.options,
          z.object({ type: z.literal("message"), id }).strict(),
        ]),
        kind: z.enum(linkKinds).optional().describe("Return only links of this kind."),
        ...pageInput,
      })
      .strict(),
    output: page(
      z.object({
        kind: z.enum(linkKinds),
        createdAt: timestamp,
        message: messageRef
          .extend({ author: actor, ...excerpt, createdAt: timestamp })
          .optional()
          .describe("Set when the target is a task or project."),
        work: z
          .object({ type: z.enum(["task", "project"]), id, title: z.string() })
          .optional()
          .describe("Set when the target is a message."),
      }),
    ),
  },
  attach_message: {
    title: "Attach message",
    description:
      "Link a message to a task or project by hand (kind attachment). Repeating the call changes nothing.",
    readOnly: false,
    idempotent: true,
    input: z.object(link).strict(),
    output: z.object({ changed: z.boolean() }),
  },
  detach_message: {
    title: "Detach message",
    description:
      "Remove a link of kind attachment between a message and a task or project. Origin and mention links stay. Repeating the call changes nothing.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: z.object(link).strict(),
    output: z.object({ changed: z.boolean() }),
  },
} as const;
