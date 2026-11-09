import { agentRequestResponse } from "./requests.ts";
import { z } from "zod";

// Owner calls from any device. The server scopes every read to the caller's own agents and to
// the records the caller can see now.

const id = z.uuid();
const organizationId = z.string().min(1).max(200);

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
