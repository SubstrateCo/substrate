import { contextEntityTypes } from "../../context/input.ts";
import { actor, excerpt, id, messageRef, page, pageInput, timestamp } from "./shared.ts";
import { z } from "zod";

export const linkKinds = ["origin", "mention", "attachment"] as const;
/** How many links a record read shows before list_linked_messages is needed. */
export const linkPreview = { messages: 5, records: 50 } as const;

const recordType = z.enum(contextEntityTypes);
const entityRef = z.object({ type: recordType, id }).strict();
const link = { messageId: id, target: entityRef };
const kind = z
  .enum(linkKinds)
  .describe(
    "origin: the record was created from the message. mention: the message mentions the record. attachment: someone linked them by hand.",
  );

/** A record that a message references. */
export const messageRecord = z.object({ type: recordType, id, title: z.string(), kind });

const linkedMessage = messageRef.extend({ author: actor, ...excerpt, createdAt: timestamp, kind });

/** The explicit links of a task, project or CRM record that the reader can see. */
export const recordLinks = z
  .object({
    messages: z
      .array(linkedMessage)
      .describe(
        `The ${linkPreview.messages} newest message links. Use list_linked_messages when messageCount is larger.`,
      ),
    messageCount: z.number().int().describe("All message links you can read."),
    records: z
      .array(
        z.object({
          type: recordType,
          id,
          title: z.string(),
          relation: z.enum(["related_to", "blocks", "duplicates"]),
          direction: z
            .enum(["outgoing", "incoming", "none"])
            .describe("related_to has none. blocks and duplicates point from source to target."),
        }),
      )
      .describe(`Up to ${linkPreview.records} linked records, newest first.`),
    recordCount: z.number().int().describe("All linked records you can read."),
  })
  .describe(
    "Explicit links you can read. Structural relationships, such as a deal's account, are in the record itself. A link never grants access.",
  );

export const linkTools = {
  list_linked_messages: {
    title: "List linked messages",
    description:
      "Page through all messages linked to a task, project or CRM record, newest link first. The read tool of the record already shows the newest ones in linked.messages; use this only when linked.messageCount is larger. Use read_thread to read a message in full.",
    readOnly: true,
    input: z
      .object({
        target: entityRef,
        kind: kind.optional().describe("Return only links of this kind."),
        ...pageInput,
      })
      .strict(),
    output: page(linkedMessage),
  },
  attach_message: {
    title: "Attach message",
    description:
      "Link a message to a task, project, contact, account, deal or contact interaction by hand (kind attachment). Checks both endpoints; does not publish a summary, grant access or wake an agent. Repeating the call changes nothing.",
    readOnly: false,
    idempotent: true,
    input: z.object(link).strict(),
    output: z.object({ changed: z.boolean() }),
  },
  detach_message: {
    title: "Detach message",
    description:
      "Remove a hand-made link between a message and a task, project or CRM record. Origin and mention links and published interaction provenance stay. Repeating the call changes nothing.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: z.object(link).strict(),
    output: z.object({ changed: z.boolean() }),
  },
} as const;
