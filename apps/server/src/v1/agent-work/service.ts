import type {
  conversationRequestsInput,
  decideProposalInput,
  ownerScopeInput,
  respondRequestInput,
} from "@substrate/contracts/agent-work";
import * as work from "@substrate/database/agent-work";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { publishCommitted } from "../realtime/committed";
import { ownerChanged } from "./hints";
import type { z } from "zod";

// Owner scope always comes from the session; the database limits it to the owner's own agents.
async function owner(headers: Headers, organizationId: string) {
  const { session } = await workspaceSession(headers, organizationId);
  return { userId: session.user.id, organizationId };
}

export function listConversationRequests(
  headers: Headers,
  input: z.output<typeof conversationRequestsInput>,
) {
  return serviceResult(async () =>
    work.listConversationRequests(
      db,
      await owner(headers, input.organizationId),
      input.conversationId,
    ),
  );
}

export function listNeedsYou(headers: Headers, input: z.output<typeof ownerScopeInput>) {
  return serviceResult(async () =>
    work.listNeedsYou(db, await owner(headers, input.organizationId)),
  );
}

export function listStatus(headers: Headers, input: z.output<typeof ownerScopeInput>) {
  return serviceResult(async () => work.listStatus(db, await owner(headers, input.organizationId)));
}

export function respondToRequest(
  headers: Headers,
  requestId: string,
  input: z.output<typeof respondRequestInput>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const identity = await owner(headers, input.organizationId);
    const result = await work.respondToRequest(db, identity, requestId, input.response);
    await ownerChanged(identity.userId);
    return result;
  });
}

export function approveProposal(
  headers: Headers,
  requestId: string,
  input: z.output<typeof decideProposalInput>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const identity = await owner(headers, input.organizationId);
    const { hints, ...result } = await work.approveProposal(db, identity, requestId);
    return publishCommitted({ result, hints });
  });
}

export function declineProposal(
  headers: Headers,
  requestId: string,
  input: z.output<typeof decideProposalInput>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const identity = await owner(headers, input.organizationId);
    const result = await work.declineProposal(db, identity, requestId);
    await ownerChanged(identity.userId);
    return result;
  });
}
