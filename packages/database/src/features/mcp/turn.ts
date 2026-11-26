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

/** The server turn an MCP call runs in, from the server's own turn and session rows. */
export interface ServerTurn {
  turnId: string;
  attempt: number;
  userAgentId: string;
  sessionId: string;
  sessionKey: string;
  sessionKind: AgentSessionKind;
  kind: TurnKind;
  /** Where the work came from. Null for routine and helper sessions. */
  origin: TurnPlace | null;
  /** Where unattended work publishes, such as a routine's destination. */
  destination: TurnPlace | null;
  /** A quiet handoff turn saves its notes on its host and must not publish or propose. */
  handoff: boolean;
}

const place = (conversationId: string | null, threadId: string | null) =>
  conversationId ? { conversationId, threadId } : null;

const turnEnded = "This turn has ended. Its calls no longer run.";

/**
 * Loads the turn that the host attached to a call. It must be a turn of this agent and owner in
 * this organization, live, in the attempt the host runs, and leased by the calling device, which
 * must be the agent's home. The caller's device is the installation the request came from.
 */
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

/** A write publishes only where the owner can still look. */
export async function requireTurnPlaces(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  turn: ServerTurn,
) {
  if (turn.origin) await requirePlace(db, identity, turn.origin);
  if (turn.destination) await requirePlace(db, identity, turn.destination);
}

/**
 * Where reply posts. By default, where the work came from: top level in a DM, or the turn's
 * thread. Background turns with a destination post there. Any turn may choose a target.
 */
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

/** Where a request's card shows: the turn's own place, if it has one. */
export function turnPlace(turn: ServerTurn): TurnPlace | null {
  if (turn.kind === "unattended" && turn.destination) return turn.destination;
  return turn.origin ?? turn.destination ?? null;
}
