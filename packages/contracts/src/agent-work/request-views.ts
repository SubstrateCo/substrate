import { agentRequestResponse, type AgentRequestResponse } from "../harness-runtime/requests.ts";
import type { ProposalAction, ProposalOutcome } from "./proposals.ts";
import type {
  AgentRequestKind,
  AgentRequestMode,
  AgentRequestPayload,
  AgentRequestStatus,
} from "./requests.ts";
import type { AgentStatusView } from "./status.ts";
import type { InboxSource, TurnAttentionReason } from "./turns.ts";
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
 * Where a turn or item belongs, as the owner can see it now: the session's place, or null when
 * it has none or the owner cannot open its conversation.
 */
export type AgentWorkPlace = { conversationId: string; threadId: string | null } | null;

/** A turn that waits for its owner to retry, start fresh or dismiss it. */
export interface AgentAttentionTurnView {
  id: string;
  userAgentId: string;
  agent: { actorId: string; name: string };
  sessionId: string;
  attentionReason: TurnAttentionReason | null;
  place: AgentWorkPlace;
  createdAt: string;
  finishedAt: string | null;
}

/** An item that the harness may or may not have read. The owner resends or discards it. */
export interface AgentUncertainItemView {
  id: string;
  userAgentId: string;
  agent: { actorId: string; name: string };
  turnId: string | null;
  source: InboxSource;
  place: AgentWorkPlace;
  createdAt: string;
}

export interface AgentNeedsYou {
  requests: AgentRequestView[];
  /** Agents whose derived status is needs_you. */
  agents: AgentStatusView[];
  turns: AgentAttentionTurnView[];
  items: AgentUncertainItemView[];
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
