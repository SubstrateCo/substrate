import type {
  conversationRequestsInput,
  decideProposalInput,
  ownerScopeInput,
  respondRequestInput,
} from "@startup-os/contracts/agent-work";
import { realtimeKeys, type RealtimeHint } from "@startup-os/contracts/realtime";
import * as work from "@startup-os/database/agent-work";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
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
    const changed: RealtimeHint[] = [...hints];
    if (result.outcome.status === "executed" && result.outcome.receipt.kind === "task") {
      const audience = realtimeKeys.organization(identity.organizationId);
      changed.push({ audience, domain: "tasks" }, { audience, domain: "context" });
    }
    await ownerChanged(identity.userId, changed);
    return result;
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
