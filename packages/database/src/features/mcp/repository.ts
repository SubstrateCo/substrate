import type { TurnContext } from "@substrate/contracts/harness/mcp";
import type { McpOutput, ServerToolName } from "@substrate/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { desktopDevices } from "../../core/devices/schema";
import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError, ConflictError } from "../../errors";
import { agentToolRequests, type PendingToolReceipt } from "./schema";
import { and, eq } from "drizzle-orm";

export async function requireHomeDevice(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  actorId: string,
  installationId: string | undefined,
) {
  if (!installationId) throw new AccessDeniedError();
  // A home change that commits after this read does not stop the caller's write.
  const [row] = await tx
    .select({
      userAgentId: userAgents.id,
      homeDeviceId: userAgents.homeDeviceId,
      deviceId: desktopDevices.id,
    })
    .from(actors)
    .innerJoin(userAgents, eq(userAgents.id, actors.userAgentId))
    .leftJoin(
      desktopDevices,
      and(
        eq(desktopDevices.userId, identity.userId),
        eq(desktopDevices.installationId, installationId),
      ),
    )
    .where(and(eq(actors.entityId, actorId), eq(userAgents.userId, identity.userId)));
  if (!row?.homeDeviceId || row.deviceId !== row.homeDeviceId) throw new AccessDeniedError();
  return row.userAgentId;
}

type ReceiptKey = {
  organizationId: string;
  actorEntityId: string;
  tool: ServerToolName;
  requestId: string;
};

/**
 * Claims the request by inserting its receipt first. A concurrent request with the same key waits
 * on the primary key until this transaction ends. Returns the stored receipt of an earlier
 * request, or undefined for a new one; save the new result with saveToolReceipt before commit.
 */
export async function claimToolReceipt(
  tx: DatabaseExecutor,
  key: ReceiptKey,
  fingerprint: string,
  turn: TurnContext,
) {
  const [claimed] = await tx
    .insert(agentToolRequests)
    .values({ ...key, fingerprint, turnId: turn.turnId, attempt: turn.attempt })
    .onConflictDoNothing()
    .returning({ requestId: agentToolRequests.requestId });
  if (claimed) return undefined;
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
  if (receipt && receipt.fingerprint !== fingerprint)
    throw new ConflictError("This request ID was already used with different input.");
  if (!receipt?.result) throw new ConflictError("The request did not finish. Try again.");
  return { ...receipt, result: receipt.result };
}

export async function saveToolReceipt(
  tx: DatabaseExecutor,
  key: ReceiptKey,
  result: McpOutput<ServerToolName> | PendingToolReceipt,
) {
  await tx
    .update(agentToolRequests)
    .set({ result })
    .where(
      and(
        eq(agentToolRequests.organizationId, key.organizationId),
        eq(agentToolRequests.actorEntityId, key.actorEntityId),
        eq(agentToolRequests.tool, key.tool),
        eq(agentToolRequests.requestId, key.requestId),
      ),
    );
}
