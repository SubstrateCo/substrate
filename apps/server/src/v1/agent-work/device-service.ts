import type {
  ackWakesInput,
  closeRequestInput,
  openRequestInput,
  publishStatusInput,
  pullWakesInput,
  registerDeviceInput,
  requestAnswersInput,
  sourcesInput,
} from "@startup-os/contracts/agent-work";
import * as work from "@startup-os/database/agent-work";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { ServiceError, serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { ownerChanged } from "./hints";
import type { z } from "zod";

// The session decides the person; the database checks the registered device and its agents.
async function device(headers: Headers, input: { organizationId: string; installationId: string }) {
  requireOrigin(headers);
  const { session, organizationId } = await workspaceSession(headers, input.organizationId);
  return { userId: session.user.id, organizationId, installationId: input.installationId };
}

// Registration needs only a verified session: a device belongs to a person, not a workspace.
export function registerDevice(headers: Headers, input: z.output<typeof registerDeviceInput>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const session = await auth.api.getSession({ headers });
    if (!session) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
    if (!session.user.emailVerified)
      throw new ServiceError("FORBIDDEN", "Verify your email to continue.");
    const result = await work.registerDevice(db, session.user.id, input);
    return { id: result.id };
  });
}

export function pullWakes(headers: Headers, input: z.output<typeof pullWakesInput>) {
  return serviceResult(async () => work.pullWakes(db, await device(headers, input), input.limit));
}

export function ackWakes(headers: Headers, input: z.output<typeof ackWakesInput>) {
  return serviceResult(async () => work.ackWakes(db, await device(headers, input), input.ids));
}

export function loadSources(headers: Headers, input: z.output<typeof sourcesInput>) {
  return serviceResult(async () =>
    work.loadSources(db, await device(headers, input), input.messageIds),
  );
}

export function publishStatus(headers: Headers, input: z.output<typeof publishStatusInput>) {
  return serviceResult(async () => {
    const identity = await device(headers, input);
    const { organizationId: _, installationId: __, ...status } = input;
    const result = await work.publishStatus(db, identity, status);
    if (result.applied) await ownerChanged(identity.userId);
    return result;
  });
}

export function openRequest(headers: Headers, input: z.output<typeof openRequestInput>) {
  return serviceResult(async () => {
    const identity = await device(headers, input);
    const { organizationId: _, installationId: __, ...request } = input;
    const result = await work.openRequest(db, identity, request);
    await ownerChanged(identity.userId);
    return result;
  });
}

export function closeRequest(headers: Headers, input: z.output<typeof closeRequestInput>) {
  return serviceResult(async () => {
    const identity = await device(headers, input);
    const result = await work.closeRequest(db, identity, input.requestId, input.status);
    if (result.changed) await ownerChanged(identity.userId);
    return result;
  });
}

export function requestAnswers(headers: Headers, input: z.output<typeof requestAnswersInput>) {
  return serviceResult(async () => work.requestAnswers(db, await device(headers, input)));
}
