import { actor, excerpt, id, page, pageInput, requestId, timed, timestamp } from "./shared.ts";
import { z } from "zod";

const kind = z.enum(["dm", "group", "channel"]);
const message = z.object({ id, author: actor, body: z.string(), createdAt: timestamp });

export const messagingTools = {
  list_conversations: {
    title: "List conversations",
    description:
      "List channels, group chats and DMs you can access, most recently active first. DMs and group chats are named after their other participants. activeSince returns only conversations with new messages or thread replies since that time.",
    readOnly: true,
    input: z
      .object({
        ...pageInput,
        kind: kind.optional(),
        activeSince: timestamp
          .optional()
          .describe("Return only conversations with activity at or after this time (ISO 8601)."),
      })
      .strict(),
    output: page(z.object({ id, kind, name: z.string(), lastActivityAt: timestamp.nullable() })),
  },
  read_conversation: {
    title: "Read conversation",
    description:
      'Read top-level messages in a conversation, most recent activity first. Each message shows its reply count. With since or until, the results also include older messages whose threads got replies in the window, marked includedBecause "thread_activity". Long text is cut; use read_thread to read a message and its replies in full.',
    readOnly: true,
    input: timed({ conversationId: id, ...pageInput }),
    output: page(
      z.object({
        id,
        author: actor,
        ...excerpt,
        createdAt: timestamp,
        replyCount: z.number().int(),
        lastReplyAt: timestamp.nullable(),
        includedBecause: z.enum(["posted", "thread_activity"]),
      }),
    ),
  },
  read_thread: {
    title: "Read thread",
    description:
      "Read one message with its whole thread: the root message and its replies, oldest first. messageId can be the root or any reply. Use this to open any message ID returned by another tool.",
    readOnly: true,
    input: z
      .object({
        messageId: id,
        ...pageInput,
        limit: pageInput.limit.default(50).describe("Replies per page, 1 to 100."),
      })
      .strict(),
    output: z.object({ conversationId: id, root: message, replies: page(message) }),
  },
  send_message: {
    title: "Send message",
    description:
      "Send a message as yourself. To reply in a thread, set threadId to the root message ID. Use list_conversations or search to find the conversation.",
    readOnly: false,
    idempotent: true,
    input: z
      .object({
        requestId,
        conversationId: id,
        threadId: id.optional().describe("The root message ID of the thread to reply in."),
        body: z
          .string()
          .trim()
          .min(1)
          .max(20000)
          .describe("Markdown. Mention records only with @[kind:uuid] tokens."),
      })
      .strict(),
    output: z.object({ id, conversationId: id, threadId: id.nullable(), createdAt: timestamp }),
  },
} as const;
