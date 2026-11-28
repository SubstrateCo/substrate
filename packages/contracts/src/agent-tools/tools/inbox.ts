import { id, timestamp } from "./shared.ts";
import { z } from "zod";

const mailHeader = z.strictObject({
  messageId: id,
  mailboxId: id,
  mailbox: z.string(),
  from: z.string(),
  subject: z.string(),
  date: timestamp,
  unread: z.boolean(),
});
const coverage = z.enum(["gmail", "cached"]);

export const inboxTools = {
  search_inbox: {
    title: "Search Inbox",
    description:
      "Find individual Gmail Inbox messages in your owner's connected mailboxes, only in a private DM with your owner. Search for words or leave query empty for recent mail. Each page samples mailboxes and orders matches by date. Follow nextCursor to cover the remaining mail; cached coverage is partial.",
    readOnly: true,
    outputPolicy: "turn-only",
    input: z.strictObject({
      query: z.string().trim().max(200).default(""),
      mailboxId: id.optional(),
      unreadOnly: z.boolean().default(false),
      limit: z.int().min(1).max(8).default(6),
      cursor: id.optional().describe("Use nextCursor with the same search options."),
    }),
    output: z.strictObject({
      items: z.array(mailHeader.extend({ snippet: z.string() })),
      mailboxes: z.array(
        z.strictObject({
          mailboxId: id,
          mailbox: z.string(),
          coverage,
          lastSync: timestamp.nullable(),
        }),
      ),
      connectedMailboxes: z.int().nonnegative(),
      nextCursor: id.nullable(),
    }),
  },
  read_inbox_message: {
    title: "Read Inbox message",
    description:
      "Read a plain-text excerpt of one email returned by search_inbox. Does not mark it read. Pass nextOffset for the next excerpt. Workspace message IDs belong to read_thread instead.",
    readOnly: true,
    outputPolicy: "turn-only",
    input: z.strictObject({ messageId: id, offset: z.int().nonnegative().default(0) }),
    output: mailHeader.extend({
      to: z.string(),
      text: z.string(),
      truncated: z.boolean(),
      nextOffset: z.int().nullable(),
      coverage,
    }),
  },
} as const;
