import type { ProposalAction, ProposalOutcome } from "./proposals.ts";
import type {
  AgentRequestKind,
  AgentRequestMode,
  AgentRequestPayload,
  AgentRequestResponse,
  AgentRequestStatus,
} from "./requests.ts";
import type { AgentStatusView } from "./status.ts";

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

/**
 * A request as its owner may see it now. When the place is hidden, the view is a placeholder:
 * sessionKey, payload, response and proposal are null, because each can name or quote the
 * conversation. A proposal whose target conversation the owner cannot open also has no proposal.
 */
export interface AgentRequestView {
  id: string;
  userAgentId: string;
  agent: { actorId: string; name: string };
  /** Null when the place is hidden: a session key contains conversation or thread IDs. */
  sessionKey: string | null;
  turnId: string;
  kind: AgentRequestKind;
  mode: AgentRequestMode;
  status: AgentRequestStatus;
  place: AgentRequestPlace;
  /** Null when the place is hidden. */
  payload: AgentRequestPayload | null;
  response: AgentRequestResponse | null;
  /**
   * Proposals only. Approval executes exactly this action. Null when the place or the action's
   * target conversation is hidden.
   */
  proposal: { action: ProposalAction; actionHash: string; outcome: ProposalOutcome | null } | null;
  createdAt: string;
  resolvedAt: string | null;
  expiresAt: string | null;
}

export interface AgentNeedsYou {
  requests: AgentRequestView[];
  /** Agents whose desktop reported needs_you, such as a turn that needs attention. */
  agents: AgentStatusView[];
}

/** A resolved blocking request that the home desktop must deliver to the native callback. */
export interface AgentRequestDelivery {
  requestId: string;
  userAgentId: string;
  turnId: string;
  nativeRequestId: string;
  response: AgentRequestResponse;
}

export interface AgentRequestOpened {
  id: string;
  status: AgentRequestStatus;
}
