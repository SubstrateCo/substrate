import type { AgentInvocationView } from "./invocations.ts";
import type { ProposalAction, ProposalOutcome } from "./proposals.ts";
import {
  agentRequestResponse,
  type AgentRequestKind,
  type AgentRequestMode,
  type AgentRequestPayload,
  type AgentRequestResponse,
  type AgentRequestStatus,
} from "./requests.ts";
import type { AgentStatusView } from "./status.ts";
import { z } from "zod";

/**
 * Where a request belongs, as the viewer can see it now. hidden carries no IDs or names; the UI
 * shows "A conversation you can't open". none is work without a conversation, such as a routine.
 */
export type AgentRequestPlace =
  | {
      access: "visible";
      conversationId: string;
      threadId: string | null;
      conversationName: string;
      /** The message the card renders under. */
      anchorMessageId: string | null;
    }
  | { access: "hidden" }
  | { access: "none" };

interface AgentRequestViewBase {
  id: string;
  userAgentId: string;
  agent: { actorId: string; name: string };
  turnId: string;
  kind: AgentRequestKind;
  mode: AgentRequestMode;
  status: AgentRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
  expiresAt: string | null;
}

/** A request in a conversation the owner can open, or in no conversation. */
export interface AgentVisibleRequestView extends AgentRequestViewBase {
  place: Exclude<AgentRequestPlace, { access: "hidden" }>;
  sessionKey: string;
  payload: AgentRequestPayload;
  response: AgentRequestResponse | null;
  /**
   * Proposals only. Approval executes exactly this action. Null when the action's target
   * conversation is hidden.
   */
  proposal: { action: ProposalAction; actionHash: string; outcome: ProposalOutcome | null } | null;
}

/**
 * A placeholder for a request in a conversation the owner cannot open. It has no session key,
 * payload, response or proposal, because each can name or quote the conversation.
 */
export interface AgentHiddenRequestView extends AgentRequestViewBase {
  place: { access: "hidden" };
  sessionKey?: never;
  payload?: never;
  response?: never;
  proposal?: never;
}

/** A request as its owner may see it now. */
export type AgentRequestView = AgentVisibleRequestView | AgentHiddenRequestView;

/**
 * An agent whose home desktop cannot run caller calls: caller wakes it withheld for a day were
 * dropped. Shows while such a drop is less than 7 days old and no caller wake of the agent was
 * stored by a desktop since the last drop.
 */
export interface AgentDesktopUpdateView {
  userAgentId: string;
  agent: { actorId: string; name: string };
  /** Calls dropped for this reason in the last 7 days. */
  droppedCalls: number;
  lastDroppedAt: string;
}

export interface AgentNeedsYou {
  requests: AgentRequestView[];
  /** Agents whose desktop reported needs_you, such as a turn that needs attention. */
  agents: AgentStatusView[];
  /** Calls of the owner's agents that wait for the owner's approval. */
  calls: AgentInvocationView[];
  /** Agents whose home desktop must be updated to run caller calls. */
  desktopUpdateRequired: AgentDesktopUpdateView[];
}

const ref = z.string().min(1);

/** A resolved blocking request that the home desktop must deliver to the native callback. */
export const agentRequestDelivery = z.object({
  requestId: ref,
  userAgentId: ref,
  turnId: ref,
  nativeRequestId: z.string(),
  response: agentRequestResponse,
});
export type AgentRequestDelivery = z.infer<typeof agentRequestDelivery>;

export interface AgentRequestOpened {
  id: string;
  status: AgentRequestStatus;
}
