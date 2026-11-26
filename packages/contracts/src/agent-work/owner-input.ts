import { agentRequestResponse } from "../harness-runtime/requests.ts";
import { organizationId } from "../workspace.ts";
import { z } from "zod";

// Owner calls from any device. The server scopes every read to the caller's own agents and to
// the records the caller can see now.

const id = z.uuid();

/** GET /agent-work/requests */
export const conversationRequestsInput = z.strictObject({ organizationId, conversationId: id });
/** GET /agent-work/needs-you and GET /agent-work/status */
export const ownerScopeInput = z.strictObject({ organizationId });

/** The :id route parameter of request actions. */
export const requestParams = z.strictObject({ id });
/** POST /agent-work/requests/:id/respond, for permissions and questions. */
export const respondRequestInput = z.strictObject({
  organizationId,
  response: agentRequestResponse,
});
/** POST /agent-work/requests/:id/approve and /decline, for proposals. */
export const decideProposalInput = z.strictObject({ organizationId });

/** The :id route parameter of agent, turn, item and conversation work routes. */
export const workParams = z.strictObject({ id });

/** GET /agent-work/agents/:id/activity */
export const agentActivityInput = z.strictObject({
  organizationId,
  /** nextCursor of the previous page. */
  cursor: z.string().min(3).max(80).optional(),
});

/** GET /agent-work/conversations/:id/work and GET /agent-work/turns/:id */
export const workReadInput = z.strictObject({ organizationId });

/**
 * POST /agent-work/turns/:id/stop|retry|dismiss|start-fresh,
 * POST /agent-work/items/:id/send-now|resend|discard and
 * POST /agent-work/conversations/:id/new-topic
 */
export const workCommandInput = z.strictObject({ organizationId });
