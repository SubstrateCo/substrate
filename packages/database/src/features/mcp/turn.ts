import type { TurnContext, TurnPlace } from "@substrate/contracts/agent-tools";
import { liveTurnStatuses, type AgentSessionKind } from "@substrate/contracts/agent-work";
import type { TurnKind } from "@substrate/contracts/harness-runtime";

import { userAgents } from "../../core/actors/user-agents.schema";
import { desktopDevices } from "../../core/devices/schema";
import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { requirePlace } from "../agent-work/place";
import { agentSessions } from "../agent-work/sessions.schema";
import { agentTurns } from "../agent-work/turns.schema";
import { and, eq } from "drizzle-orm";

export interface ServerTurn {
  turnId: string;
  attempt: number;
  userAgentId: string;
  sessionId: string;
  sessionKey: string;
  sessionKind: AgentSessionKind;
  kind: TurnKind;
  origin: TurnPlace | null;
  destination: TurnPlace | null;
  handoff: boolean;
}

const place = (conversationId: string | null, threadId: string | null) =>
  conversationId ? { conversationId, threadId } : null;

const turnEnded = "This turn has ended. Its calls no longer run.";

export async function requireLiveTurn(
  db: DatabaseExecutor,
  identity: SessionIdentity & { actorEntityId: string },
  context: TurnContext,
  installationId: string | undefined,
): Promise<ServerTurn> {
  if (!installationId) throw new AccessDeniedError();
  const [row] = await db
    .select({
      turn: agentTurns,
      session: agentSessions,
      homeDeviceId: userAgents.homeDeviceId,
      callerDeviceId: desktopDevices.id,
    })
    .from(agentTurns)
    .innerJoin(agentSessions, eq(agentSessions.id, agentTurns.sessionId))
    .innerJoin(userAgents, eq(userAgents.id, agentTurns.userAgentId))
    .leftJoin(
      desktopDevices,
      and(
        eq(desktopDevices.userId, identity.userId),
        eq(desktopDevices.installationId, installationId),
      ),
    )
    .where(
      and(
        eq(agentTurns.id, context.turnId),
        eq(agentTurns.organizationId, identity.organizationId),
        eq(agentTurns.ownerUserId, identity.userId),
        eq(agentTurns.agentActorEntityId, identity.actorEntityId),
      ),
    );
  if (!row?.callerDeviceId) throw new AccessDeniedError();
  const { turn, session } = row;
  if (turn.leaseDeviceId !== row.callerDeviceId || row.homeDeviceId !== row.callerDeviceId) {
    if (!liveTurnStatuses.includes(turn.status)) throw new ConflictError(turnEnded);
    throw new AccessDeniedError();
  }
  if (!liveTurnStatuses.includes(turn.status) || turn.attempt !== context.attempt)
    throw new ConflictError(turnEnded);
  return {
    turnId: turn.id,
    attempt: turn.attempt,
    userAgentId: turn.userAgentId,
    sessionId: session.id,
    sessionKey: session.key,
    sessionKind: session.kind,
    kind: turn.kind,
    origin: place(session.originConversationId, session.originThreadId),
    destination: place(session.destinationConversationId, session.destinationThreadId),
    handoff: turn.handoff,
  };
}

export async function requireTurnPlaces(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  turn: ServerTurn,
) {
  if (turn.origin) await requirePlace(db, identity, turn.origin);
  if (turn.destination) await requirePlace(db, identity, turn.destination);
}

export function replyTarget(
  turn: ServerTurn,
  to: { conversationId: string; threadId?: string } | undefined,
): TurnPlace {
  if (to) return { conversationId: to.conversationId, threadId: to.threadId ?? null };
  if (turn.kind === "unattended" && turn.destination) return turn.destination;
  const target = turn.origin ?? turn.destination;
  if (!target) throw new ValidationError("This turn has no place to reply. Set to.");
  return target;
}

export function turnPlace(turn: ServerTurn): TurnPlace | null {
  if (turn.kind === "unattended" && turn.destination) return turn.destination;
  return turn.origin ?? turn.destination ?? null;
}
