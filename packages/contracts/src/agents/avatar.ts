import { isAvatarCode } from "@substrate/agent-avatars/config";
import { z } from "zod";

/**
 * How an agent looks, as a short stored code such as `1a3f0c` (see `encodeAvatarCode` in
 * `@substrate/agent-avatars/config`). The code is fixed when the agent is created and changes
 * only when its owner picks a new shape or colour. Clients draw it with
 * `decodeAvatarCode(code)`.
 */
export const agentAvatarCode = z.string().refine(isAvatarCode, "Not an avatar code.");
export type AgentAvatarCode = z.infer<typeof agentAvatarCode>;

/** The owner's new look for an agent, built with `withAvatarChoices`. */
export const setAgentAvatarInput = z.strictObject({ id: z.uuid(), avatar: agentAvatarCode });
export type SetAgentAvatarInput = z.input<typeof setAgentAvatarInput>;
