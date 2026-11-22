import type { TurnContext } from "@substrate/contracts/harness/mcp";
import type { McpOutput, ServerToolName } from "@substrate/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { findDevice } from "../../core/devices/repository";
import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError, mapPostgresError } from "../../errors";
import { agentRequests } from "../agent-work/requests.schema";
import { agentToolRequests } from "./schema";
import { and, eq } from "drizzle-orm";

export async function requireHomeDevice(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  actorId: string,
  installationId: string | undefined,
) {
  // Keep the home assignment stable until the write commits.
  const [row] = await tx
    .select({ userAgentId: userAgents.id, homeDeviceId: userAgents.homeDeviceId })
    .from(actors)
    .innerJoin(userAgents, eq(userAgents.id, actors.userAgentId))
    .where(and(eq(actors.entityId, actorId), eq(userAgents.userId, identity.userId)))
    .for("share", { of: userAgents });
  if (!row?.homeDeviceId || !installationId) throw new AccessDeniedError();
  const device = await findDevice(tx, identity.userId, installationId);
  if (device?.id !== row.homeDeviceId) throw new AccessDeniedError();
  return row.userAgentId;
}

export async function requireOwnedProposal(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  proposalId: string,
) {
  const [request] = await tx
    .select({ id: agentRequests.id })
    .from(agentRequests)
    .where(and(eq(agentRequests.id, proposalId), eq(agentRequests.ownerUserId, identity.userId)));
  if (!request) throw new AccessDeniedError();
}

type ReceiptKey = {
  organizationId: string;
  actorEntityId: string;
  tool: ServerToolName;
  requestId: string;
};

export async function findToolReceipt(tx: DatabaseExecutor, key: ReceiptKey) {
  const [receipt] = await tx
    .select()
    .from(agentToolRequests)
    .where(
      and(
        eq(agentToolRequests.organizationId, key.organizationId),
        eq(agentToolRequests.actorEntityId, key.actorEntityId),
        eq(agentToolRequests.tool, key.tool),
        eq(agentToolRequests.requestId, key.requestId),
      ),
    );
  return receipt;
}

export async function saveToolReceipt(
  tx: DatabaseExecutor,
  key: ReceiptKey,
  fingerprint: string,
  result: McpOutput<ServerToolName>,
  turn: TurnContext,
) {
  await tx
    .insert(agentToolRequests)
    .values({ ...key, fingerprint, result, turnId: turn.turnId, attempt: turn.attempt })
    .catch((error: Error) =>
      mapPostgresError(error, { unique: "This request ID was already used." }),
    );
}
