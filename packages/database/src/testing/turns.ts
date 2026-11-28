import type { TurnContext, TurnPlace } from "@substrate/contracts/agent-tools";
import { parseSessionKey, sessionKeys } from "@substrate/contracts/agent-work";
import type { TurnKind } from "@substrate/contracts/harness-runtime";

import type { DatabaseExecutor } from "../core/executor";
import { leaseUntil } from "../features/agent-work/host/lease-time";
import { ensureSession } from "../features/agent-work/sessions";
import { agentTurns } from "../schema";

export interface TurnSpec {
  key: string;
  kind: TurnKind;
  origin: TurnPlace | null;
  destination?: TurnPlace | null;
  handoff?: boolean;
  installationId?: string;
  leaseDeviceId?: string;
}

export const dmTurn = (conversationId: string, kind: TurnKind = "interactive"): TurnSpec => ({
  key: sessionKeys.dm(conversationId),
  kind,
  origin: { conversationId, threadId: null },
});

export const threadTurn = (conversationId: string, rootId: string): TurnSpec => ({
  key: sessionKeys.thread(rootId),
  kind: "interactive",
  origin: { conversationId, threadId: rootId },
});

export const routineTurn = (destination: TurnPlace | null): TurnSpec => ({
  key: sessionKeys.routine(crypto.randomUUID()),
  kind: "unattended",
  origin: null,
  destination,
});

type Agent = {
  agentId: string;
  actorId: string;
  device: { id: string };
  identity: { userId: string; organizationId: string };
};

export async function insertTurn(db: DatabaseExecutor, agent: Agent, spec: TurnSpec) {
  const now = new Date();
  const kind = parseSessionKey(spec.key)?.kind;
  if (!kind) throw new Error("The test turn has an invalid session key.");
  const ref = {
    organizationId: agent.identity.organizationId,
    userAgentId: agent.agentId,
    agentActorEntityId: agent.actorId,
    ownerUserId: agent.identity.userId,
  };
  const session = await ensureSession(
    db,
    ref,
    { key: spec.key, kind, origin: spec.origin, destination: spec.destination ?? null },
    now,
  );
  const [turn] = await db
    .insert(agentTurns)
    .values({
      ...ref,
      sessionId: session.id,
      folderKey: `test:${crypto.randomUUID()}`,
      kind: spec.kind,
      status: "running",
      handoff: spec.handoff ?? false,
      leaseDeviceId: spec.leaseDeviceId ?? agent.device.id,
      leaseExpiresAt: leaseUntil(now),
      startedAt: now,
    })
    .returning();
  return turn!;
}

export function turnContexts(db: DatabaseExecutor, agent: Agent) {
  const turns = new WeakMap<TurnSpec, Promise<TurnContext>>();
  return (spec: TurnSpec) => {
    let turn = turns.get(spec);
    if (!turn) {
      turn = insertTurn(db, agent, spec).then((row) => ({ turnId: row.id, attempt: row.attempt }));
      turns.set(spec, turn);
    }
    return turn;
  };
}

export const callerOf = (spec: TurnSpec, home: string) =>
  "installationId" in spec ? spec.installationId : home;
