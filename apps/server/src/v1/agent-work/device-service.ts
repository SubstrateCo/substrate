import type {
  ackWakesInput,
  closeRequestInput,
  deviceHeartbeatInput,
  openRequestInput,
  publishStatusInput,
  pullWakesInput,
  registerDeviceInput,
  requestAnswersInput,
  sourcesInput,
} from "@substrate/contracts/agent-work";
import { createRepositories } from "@substrate/database";
import * as work from "@substrate/database/agent-work";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, requireVerified, workspaceSession } from "../../shared/workspace";
import { publishCommitted } from "../realtime/committed";
import type { z } from "zod";

// The session decides the person; the database checks the registered device and its agents.
async function device(headers: Headers, input: { organizationId: string; installationId: string }) {
  requireOrigin(headers);
  const { session, organizationId } = await workspaceSession(headers, input.organizationId);
  return { userId: session.user.id, organizationId, installationId: input.installationId };
}

// Registration and presence need only a verified session: a device belongs to a person, not a
// workspace.
async function deviceOwner(headers: Headers) {
  requireOrigin(headers);
  return requireVerified(await auth.api.getSession({ headers })).user.id;
}

export function registerDevice(headers: Headers, input: z.output<typeof registerDeviceInput>) {
  return serviceResult(async () => {
    const owner = await createRepositories(db).forOwnerSession({
      userId: await deviceOwner(headers),
    });
    const result = await publishCommitted(await owner.devices.register(input));
    return { id: result.id };
  });
}

export function deviceHeartbeat(headers: Headers, input: z.output<typeof deviceHeartbeatInput>) {
  return serviceResult(async () => {
    const owner = await createRepositories(db).forOwnerSession({
      userId: await deviceOwner(headers),
    });
    await publishCommitted(await owner.devices.touch(input.installationId));
    return {};
  });
}

export function pullWakes(headers: Headers, input: z.output<typeof pullWakesInput>) {
  return serviceResult(async () =>
    publishCommitted(await work.pullWakes(db, await device(headers, input), input.limit)),
  );
}

export function ackWakes(headers: Headers, input: z.output<typeof ackWakesInput>) {
  return serviceResult(async () =>
    publishCommitted(await work.ackWakes(db, await device(headers, input), input.ids)),
  );
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
    return publishCommitted(await work.publishStatus(db, identity, status));
  });
}

export function openRequest(headers: Headers, input: z.output<typeof openRequestInput>) {
  return serviceResult(async () => {
    const identity = await device(headers, input);
    const { organizationId: _, installationId: __, ...request } = input;
    return publishCommitted(await work.openRequest(db, identity, request));
  });
}

export function closeRequest(headers: Headers, input: z.output<typeof closeRequestInput>) {
  return serviceResult(async () => {
    const identity = await device(headers, input);
    return publishCommitted(await work.closeRequest(db, identity, input.requestId, input.status));
  });
}

export function requestAnswers(headers: Headers, input: z.output<typeof requestAnswersInput>) {
  return serviceResult(async () => work.requestAnswers(db, await device(headers, input)));
}
