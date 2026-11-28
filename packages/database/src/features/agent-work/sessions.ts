import type { TurnPlace } from "@substrate/contracts/agent-tools";
import {
  folderKeys,
  parseSessionKey,
  sessionMachine,
  type AgentSessionKind,
} from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../core/executor";
import { inStates } from "./machine-sql";
import { agentSessions } from "./sessions.schema";
import { and, eq } from "drizzle-orm";

export type SessionRow = typeof agentSessions.$inferSelect;

export interface AgentRef {
  organizationId: string;
  userAgentId: string;
  agentActorEntityId: string;
  ownerUserId: string;
}

export interface EnsureSessionInput {
  key: string;
  kind: AgentSessionKind;
  parentSessionId?: string | null;
  origin?: TurnPlace | null;
  destination?: TurnPlace | null;
}

export const agentColumns = (agent: AgentRef): AgentRef => ({
  organizationId: agent.organizationId,
  userAgentId: agent.userAgentId,
  agentActorEntityId: agent.agentActorEntityId,
  ownerUserId: agent.ownerUserId,
});

export function helperIdOf(session: Pick<SessionRow, "kind" | "key">) {
  return session.kind === "helper" ? (parseSessionKey(session.key)?.id ?? null) : null;
}

export function folderKey(session: Pick<SessionRow, "kind" | "key" | "userAgentId">) {
  const helperId = helperIdOf(session);
  return helperId ? folderKeys.helper(helperId) : folderKeys.main(session.userAgentId);
}

export async function ensureSession(
  db: DatabaseExecutor,
  agent: AgentRef,
  input: EnsureSessionInput,
  now: Date,
) {
  await db
    .insert(agentSessions)
    .values({
      ...agentColumns(agent),
      key: input.key,
      kind: input.kind,
      parentSessionId: input.parentSessionId ?? null,
      originConversationId: input.origin?.conversationId ?? null,
      originThreadId: input.origin?.threadId ?? null,
      destinationConversationId: input.destination?.conversationId ?? null,
      destinationThreadId: input.destination?.threadId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: [agentSessions.userAgentId, agentSessions.key] });
  const [row] = await db
    .select()
    .from(agentSessions)
    .where(and(eq(agentSessions.userAgentId, agent.userAgentId), eq(agentSessions.key, input.key)));
  if (!row) throw new Error("The session was not saved.");
  return row;
}

export async function setSessionStatus(
  db: DatabaseExecutor,
  id: string,
  event: keyof typeof sessionMachine.events,
  now: Date,
) {
  await db
    .update(agentSessions)
    .set({ status: sessionMachine.events[event].to, updatedAt: now })
    .where(
      and(eq(agentSessions.id, id), inStates(agentSessions.status, sessionMachine.from(event))),
    );
}
