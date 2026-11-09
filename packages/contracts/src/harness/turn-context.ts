import { z } from "zod";

export const turnKinds = ["interactive", "unattended"] as const;
export type TurnKind = (typeof turnKinds)[number];

/** threadId is the root message ID of a thread, or null for top-level messages in the conversation. */
const place = z.strictObject({ conversationId: z.uuid(), threadId: z.uuid().nullable() });
export type TurnPlace = z.infer<typeof place>;

/**
 * The turn that an MCP call belongs to. The desktop host attaches it to every call from the
 * turn's MCP lease; the model never supplies it. The server checks that it belongs to the calling
 * owner's agent before it uses any field.
 */
export const turnContextSchema = z.strictObject({
  turnId: z.uuid(),
  attempt: z.number().int().min(1).max(1000),
  sessionKey: z.string().min(1).max(200),
  /** Where the work came from. Null for routine and helper sessions, which have no source message. */
  origin: place.nullable(),
  kind: z.enum(turnKinds),
  /** Where unattended work publishes, such as a routine's destination. */
  destination: place.optional(),
  /**
   * The registered installation of the desktop that runs the turn. Write tools run only when it
   * is the agent's home device; a call without it can only read.
   */
  installationId: z.uuid().optional(),
  /** A quiet handoff turn saves its notes locally and must not publish or propose. */
  purpose: z.enum(["handoff"]).optional(),
});
export type TurnContext = z.infer<typeof turnContextSchema>;
