import type {
  agentRunInput,
  claimRunsInput,
  closeRequestInput,
  conversationRunsInput,
  deliveriesInput,
  finishRunInput,
  heartbeatInput,
  openRequestInput,
  registerDeviceInput,
  respondRequestInput,
  runEventsInput,
  runSessionInput,
} from "@startup-os/contracts/agent-runs";
import { realtimeKeys } from "@startup-os/contracts/realtime";
import * as runs from "@startup-os/database/agent-runs";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { ServiceError, serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { publishRefresh } from "../realtime/publisher";
import type { z } from "zod";

// Runs belong to one person. Every window and desktop of that person refreshes its run views.
const changed = (userId: string) =>
  publishRefresh([{ audience: realtimeKeys.user(userId), domain: "agent-runs" }]);

async function owner(headers: Headers, organizationId: string) {
  const { session } = await workspaceSession(headers, organizationId);
  return { userId: session.user.id, organizationId };
}

async function device(headers: Headers, input: { organizationId: string; installationId: string }) {
  requireOrigin(headers);
  const identity = await owner(headers, input.organizationId);
  return { ...identity, installationId: input.installationId };
}

export function listConversationRuns(
  headers: Headers,
  input: z.output<typeof conversationRunsInput>,
) {
  return serviceResult(async () =>
    runs.listConversationRuns(db, await owner(headers, input.organizationId), input.conversationId),
  );
}

export function listActiveRuns(headers: Headers, input: { organizationId: string }) {
  return serviceResult(async () =>
    runs.listActiveRuns(db, await owner(headers, input.organizationId)),
  );
}

export function getRun(headers: Headers, input: z.output<typeof agentRunInput>) {
  return serviceResult(async () =>
    runs.getRun(db, await owner(headers, input.organizationId), input.runId),
  );
}

export function cancelRun(headers: Headers, input: z.output<typeof agentRunInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const identity = await owner(headers, input.organizationId);
    const result = await runs.cancelRun(db, identity, input.runId);
    await changed(identity.userId);
    return result;
  });
}

export function respondToRequest(headers: Headers, input: z.output<typeof respondRequestInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const identity = await owner(headers, input.organizationId);
    const result = await runs.respondToRequest(db, identity, input.requestId, input.response);
    await changed(identity.userId);
    return result;
  });
}

// Registration needs only a verified session: a device belongs to a person, not a workspace.
export function registerDevice(headers: Headers, input: z.output<typeof registerDeviceInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const session = await auth.api.getSession({ headers });
    if (!session) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
    if (!session.user.emailVerified)
      throw new ServiceError("FORBIDDEN", "Verify your email to continue.");
    const result = await runs.registerDevice(db, session.user.id, input);
    return { id: result.id };
  });
}

export function claimRuns(headers: Headers, input: z.output<typeof claimRunsInput>) {
  return serviceResult(async () => {
    const identity = await device(headers, input);
    const claimed = await runs.claimRuns(db, identity);
    if (claimed.length) await changed(identity.userId);
    return claimed;
  });
}

export function heartbeat(headers: Headers, input: z.output<typeof heartbeatInput>) {
  return serviceResult(async () => runs.heartbeat(db, await device(headers, input), input.runIds));
}

export function appendEvents(headers: Headers, input: z.output<typeof runEventsInput>) {
  return serviceResult(async () => {
    const identity = await device(headers, input);
    await runs.appendEvents(db, identity, input.runId, input.events);
    await changed(identity.userId);
    return null;
  });
}

export function recordSession(headers: Headers, input: z.output<typeof runSessionInput>) {
  return serviceResult(async () => {
    await runs.recordSession(db, await device(headers, input), input.runId, input.harnessSessionId);
    return null;
  });
}

export function openRequest(headers: Headers, input: z.output<typeof openRequestInput>) {
  return serviceResult(async () => {
    const identity = await device(headers, input);
    const result = await runs.openRequest(db, identity, input);
    await changed(identity.userId);
    return result;
  });
}

export function closeRequest(headers: Headers, input: z.output<typeof closeRequestInput>) {
  return serviceResult(async () => {
    const identity = await device(headers, input);
    await runs.closeRequest(db, identity, input.requestId, input.status);
    await changed(identity.userId);
    return null;
  });
}

export function pendingDeliveries(headers: Headers, input: z.output<typeof deliveriesInput>) {
  return serviceResult(async () => runs.pendingDeliveries(db, await device(headers, input)));
}

export function finishRun(headers: Headers, input: z.output<typeof finishRunInput>) {
  return serviceResult(async () => {
    const identity = await device(headers, input);
    await runs.finishRun(db, identity, input);
    await changed(identity.userId);
    return null;
  });
}
