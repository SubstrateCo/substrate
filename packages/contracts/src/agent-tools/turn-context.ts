import { z } from "zod";

/** threadId is the root message ID of a thread, or null for top-level messages in the conversation. */
export interface TurnPlace {
  conversationId: string;
  threadId: string | null;
}

/**
 * The server turn that an MCP call belongs to. The agent host attaches it to every call from the
 * turn's MCP lease; the model never supplies it. The server loads the turn and uses only its own
 * rows: the turn must be live, in this attempt, and leased by the caller's device, which must be
 * the agent's home. Session, places, mode and handoff come from the server turn.
 */
export const turnContextSchema = z.strictObject({
  turnId: z.uuid(),
  attempt: z.number().int().min(1).max(1000),
});
export type TurnContext = z.infer<typeof turnContextSchema>;
