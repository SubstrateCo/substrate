import { proposalAction, proposalSummary } from "../../agent-work/proposals.ts";
import { agentAsk } from "../../agent-work/requests.ts";
import { conversationKind } from "../../messaging/input.ts";
import { messageRecord } from "./links.ts";
import { author, excerpt, id, page, pageInput, requestId, timed, timestamp } from "./shared.ts";
import { z } from "zod";

const records = z
  .array(messageRecord)
  .describe("Tasks, projects and CRM records this message references that you can read.");
const message = z.object({ id, author, body: z.string(), createdAt: timestamp, records });

/** What reply returns. The place is always the posted message's own conversation and thread. */
export const replyResult = z.object({
  messageId: id,
  conversationId: id,
  threadId: id.nullable(),
  questionId: id.nullable().describe("The question request, when you set ask."),
  createdAt: timestamp,
});
/** What propose returns: the pending proposal request. */
export const proposeResult = z.object({ proposalId: id, status: z.literal("pending") });

export const messagingTools = {
  list_conversations: {
    title: "List conversations",
    description:
      "List channels, group chats and DMs you can access, most recently active first. DMs and group chats are named after their other participants. activeSince returns only conversations with new messages or thread replies since that time. Use this, not search, to catch up on recent activity or to find a DM by person.",
    readOnly: true,
    input: z
      .object({
        ...pageInput,
        kind: conversationKind.optional(),
        activeSince: timestamp
          .optional()
          .describe("Return only conversations with activity at or after this time (ISO 8601)."),
      })
      .strict(),
    output: page(
      z.object({
        id,
        kind: conversationKind,
        name: z.string(),
        lastActivityAt: timestamp.nullable(),
      }),
    ),
  },
  read_conversation: {
    title: "Read conversation",
    description:
      'Read top-level messages in a conversation, most recent activity first. Each message shows its reply count. With since or until, the results also include older messages whose threads got replies in the window, marked includedBecause "thread_activity". Each message lists the records it references; open them with get_task, get_project or get_crm_record. Long text is cut; use read_thread to read a message and its replies in full.',
    readOnly: true,
    input: timed({ conversationId: id, ...pageInput }),
    output: page(
      z.object({
        id,
        author,
        ...excerpt,
        createdAt: timestamp,
        replyCount: z.number().int(),
        lastReplyAt: timestamp.nullable(),
        includedBecause: z.enum(["posted", "thread_activity"]),
        records,
      }),
    ),
  },
  read_thread: {
    title: "Read thread",
    description:
      "Read one message with its whole thread: the root message and its replies, oldest first. messageId can be the root or any reply. Use this to open any message ID returned by another tool. Each message lists the records it references.",
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
  reply: {
    publishes: [
      { kind: "message", id: "messageId", conversationId: "conversationId", threadId: "threadId" },
      { kind: "request", id: "questionId", requestKind: "question" },
    ],
    title: "Reply",
    description:
      "Publish your result to your owner. By default it posts where the turn's work came from: top level in a direct message conversation, or in the turn's thread. Set ask to ask your owner one question; the answer arrives in a later turn, so end your turn after asking. In interactive turns only, set to to post in another conversation you can access; background turns must use propose for that.",
    readOnly: false,
    idempotent: true,
    input: z
      .object({
        requestId,
        body: z
          .string()
          .trim()
          .min(1)
          .max(20000)
          .describe("Markdown. Mention records only with @[kind:uuid] tokens."),
        ask: agentAsk.optional().describe("One question for your owner, shown under the reply."),
        to: z
          .object({
            conversationId: id,
            threadId: id.optional().describe("The root message ID of the thread to reply in."),
          })
          .strict()
          .optional()
          .describe("Interactive turns only. Post here instead of the turn's own place."),
      })
      .strict(),
    output: replyResult,
  },
  propose: {
    publishes: [{ kind: "request", id: "proposalId", requestKind: "proposal" }],
    title: "Propose an action",
    description:
      "Ask your owner to approve one exact action: reply_elsewhere (post in another conversation or thread), create_task or update_task. Your owner approves or declines exactly this action, and approval runs it as you. The result arrives in a later turn, so end your turn after proposing.",
    readOnly: false,
    idempotent: true,
    input: z
      .object({
        requestId,
        summary: proposalSummary.describe("One or two sentences: what and why."),
        action: proposalAction,
      })
      .strict(),
    output: proposeResult,
  },
} as const;
