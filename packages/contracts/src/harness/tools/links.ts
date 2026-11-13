import { contextEntityTypes } from "../../context/input.ts";
import { actor, excerpt, id, messageRef, page, pageInput, timestamp } from "./shared.ts";
import { z } from "zod";

export const linkKinds = ["origin", "mention", "attachment"] as const;
const entityRef = z.object({ type: z.enum(contextEntityTypes), id }).strict();
const link = { messageId: id, target: z.object({ type: z.enum(contextEntityTypes), id }).strict() };

export const linkTools = {
  list_links: {
    title: "List links",
    description:
      "List permitted explicit links for tasks, projects or CRM records. source messages (default) reads message references; target message reads its linked records. source entities reads entity links (related records and task blocks/duplicates relations), not structural account/participant relationships. Read both sources for explicit context; neither is a complete relationship graph. Linking never grants access or wakes agents.",
    readOnly: true,
    input: z
      .object({
        target: z.union([entityRef, z.object({ type: z.literal("message"), id }).strict()]),
        source: z.enum(["messages", "entities"]).default("messages"),
        kind: z.enum(linkKinds).optional().describe("Return only links of this kind."),
        ...pageInput,
      })
      .strict()
      .refine(
        (value) => value.source !== "entities" || (value.target.type !== "message" && !value.kind),
        "Entity links require an entity target and do not use message kind filters.",
      ),
    output: page(
      z.object({
        kind: z.enum([...linkKinds, "entity"]),
        createdAt: timestamp,
        message: messageRef
          .extend({ author: actor, ...excerpt, createdAt: timestamp })
          .optional()
          .describe("Set for message references to an entity target."),
        work: z
          .object({ type: z.enum(contextEntityTypes), id, title: z.string() })
          .optional()
          .describe("Set when the target is a message."),
        entity: entityRef
          .extend({
            title: z.string(),
            relation: z.enum(["related_to", "blocks", "duplicates"]),
            direction: z.enum(["outgoing", "incoming", "none"]),
          })
          .optional()
          .describe(
            "The readable opposite endpoint of an entity link. related_to has direction none; blocks and duplicates point from source to target.",
          ),
      }),
    ),
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
