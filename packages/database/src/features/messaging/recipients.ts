import { messagingLimits } from "@substrate/contracts/messaging/input";

import { ensureHumanActors, ensureOwnedAgentActors } from "../../core/actors/provisioning";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import type { DatabaseExecutor } from "../../core/executor";
import { member } from "../../core/organizations/schema";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError, ValidationError } from "../../errors";
import type { MemberActor } from "./members";
import { and, eq, inArray } from "drizzle-orm";

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@"))
    throw new ValidationError("An exact email address is required.");
  return normalized;
}

/**
 * Splits emails into verified people of this organization and external addresses, which become
 * invitations. People join through their human actor here. One statement reads the people and
 * their actors; only a person's first workspace use provisions an actor.
 */
export async function recipients(db: DatabaseExecutor, scope: SessionIdentity, emails: string[]) {
  if (emails.length > messagingLimits.recipients)
    throw new ValidationError(`At most ${messagingLimits.recipients} recipients are allowed.`);
  const normalized = [...new Set(emails.map(normalizeEmail))];
  if (!normalized.length) return { people: [], external: [] };
  const matches = await db
    .select({
      userId: user.id,
      email: user.email,
      actorId: actors.entityId,
    })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .leftJoin(
      actors,
      and(eq(actors.organizationId, member.organizationId), eq(actors.userId, user.id)),
    )
    .where(
      and(
        inArray(user.email, normalized),
        eq(user.emailVerified, true),
        eq(member.organizationId, scope.organizationId),
      ),
    );
  const matched = new Set(matches.map((match) => match.email));
  const others = matches.filter((match) => match.userId !== scope.userId);
  const provisioned = new Map(
    (
      await ensureHumanActors(db, {
        organizationId: scope.organizationId,
        userIds: others.flatMap((match) => (match.actorId ? [] : [match.userId])),
      })
    ).map((actor) => [actor.userId, actor.entityId]),
  );
  const people: (MemberActor & { userId: string })[] = others.map(({ userId, actorId }) => ({
    entityId: actorId ?? provisioned.get(userId)!,
    type: "human",
    userId,
    organizationId: scope.organizationId,
  }));
  return { people, external: normalized.filter((email) => !matched.has(email)) };
}

/** Only the owner adds their agent, and only an enabled agent, with its actor here. */
export async function ownedAgents(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  agentIds: string[],
): Promise<MemberActor[]> {
  if (agentIds.length > messagingLimits.agents)
    throw new ValidationError(`At most ${messagingLimits.agents} agents are allowed.`);
  const requested = new Set(agentIds);
  if (!requested.size) return [];
  const owned = await ensureOwnedAgentActors(db, scope);
  const selected = owned.filter((actor) => actor.userAgentId && requested.has(actor.userAgentId));
  if (selected.length !== requested.size) throw new AccessDeniedError();
  return selected.map((actor) => ({
    entityId: actor.entityId,
    type: "agent",
    organizationId: scope.organizationId,
  }));
}
