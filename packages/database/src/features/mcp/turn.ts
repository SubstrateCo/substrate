import { parseSessionKey } from "@substrate/contracts/agent-work";
import type { TurnContext } from "@substrate/contracts/harness/mcp";

import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError, ValidationError } from "../../errors";
import { requirePlace } from "../agent-work/place";
import { agentRequests } from "../agent-work/requests/requests.schema";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { agentToolRequests } from "./schema";
import { and, eq, exists, ne, sql } from "drizzle-orm";

type TurnPlace = NonNullable<TurnContext["origin"]>;

const samePlace = (a: TurnPlace | null, b: TurnPlace) =>
  a?.conversationId === b.conversationId && a.threadId === b.threadId;

/**
 * Checks the turn context that the desktop host attached to a write. The turn must match its
 * session, its places must be visible to the owner, and its ID must not belong to another agent.
 */
export async function requireTurn(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  agent: { actorId: string; userAgentId: string },
  turn: TurnContext,
) {
  const session = parseSessionKey(turn.sessionKey);
  if (!session) throw new ValidationError("The turn has an invalid session.");
  if (session.kind === "dm") {
    if (!samePlace(turn.origin, { conversationId: session.id, threadId: null }))
      throw new ValidationError("A direct message turn must start from its conversation.");
    const [dm] = await db
      .select({ kind: messagingConversations.kind })
      .from(messagingConversations)
      .where(eq(messagingConversations.id, session.id));
    if (dm?.kind !== "dm") throw new ValidationError("The turn's conversation is not a DM.");
  } else if (session.kind === "thread") {
    if (turn.origin?.threadId !== session.id)
      throw new ValidationError("A thread turn must start from its thread.");
  } else if (turn.origin)
    throw new ValidationError("Routine and helper turns have no source conversation.");
  if (turn.origin) await requirePlace(db, identity, turn.origin);
  if (turn.destination) await requirePlace(db, identity, turn.destination);

  // Turn IDs are random. One that another agent already used is not this agent's turn.
  const request = db
    .select({ id: agentRequests.id })
    .from(agentRequests)
    .where(
      and(eq(agentRequests.turnId, turn.turnId), ne(agentRequests.userAgentId, agent.userAgentId)),
    );
  const receipt = db
    .select({ id: agentToolRequests.requestId })
    .from(agentToolRequests)
    .where(
      and(
        eq(agentToolRequests.turnId, turn.turnId),
        ne(agentToolRequests.actorEntityId, agent.actorId),
      ),
    );
  const message = db
    .select({ id: messagingMessages.id })
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.originTurnId, turn.turnId),
        ne(messagingMessages.authorActorEntityId, agent.actorId),
      ),
    );
  const [turnId] = await db.execute<{ used: boolean }>(
    sql`SELECT (${exists(request)} OR ${exists(receipt)} OR ${exists(message)}) AS used`,
  );
  if (turnId?.used !== false) throw new AccessDeniedError();
  return turn;
}

/**
 * Where reply posts. By default, where the work came from: top level in a DM, or the turn's
 * thread. Background turns with a destination post there. Any turn may choose a target.
 */
export function replyTarget(
  turn: TurnContext,
  to: { conversationId: string; threadId?: string } | undefined,
): TurnPlace {
  if (to) return { conversationId: to.conversationId, threadId: to.threadId ?? null };
  if (turn.kind === "unattended" && turn.destination) return turn.destination;
  const place = turn.origin ?? turn.destination;
  if (!place) throw new ValidationError("This turn has no place to reply. Set to.");
  return place;
}

/** Where a request's card shows: the turn's own place, if it has one. */
export function turnPlace(turn: TurnContext): TurnPlace | null {
  if (turn.kind === "unattended" && turn.destination) return turn.destination;
  return turn.origin ?? turn.destination ?? null;
}
