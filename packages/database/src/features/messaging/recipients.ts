import type { DatabaseExecutor } from "../../client";
import { ensureHumanActor, ensureOwnedAgentActors } from "../../core/actors/provisioning";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import type { MessagingIdentity } from "./access";
import type { MemberActor } from "./members";
import { and, eq, inArray, sql } from "drizzle-orm";

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
export async function recipients(db: DatabaseExecutor, scope: MessagingIdentity, emails: string[]) {
  if (emails.length > 100) throw new ValidationError("At most 100 recipients are allowed.");
  const normalized = [...new Set(emails.map(normalizeEmail))];
  if (!normalized.length) return { people: [], external: [] };
  const matches = await db
    .select({
      userId: user.id,
      name: user.name,
      email: sql<string>`lower(${user.email})`,
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
        inArray(sql`lower(${user.email})`, normalized),
        eq(user.emailVerified, true),
        eq(member.organizationId, scope.organizationId),
      ),
    );
  const matched = new Set(matches.map((match) => match.email));
  const people: (MemberActor & { userId: string })[] = [];
  for (const { userId, name, actorId } of matches) {
    if (userId === scope.userId) continue;
    const entityId =
      actorId ??
      (await ensureHumanActor(db, { userId, name, organizationId: scope.organizationId })).entityId;
    people.push({ entityId, type: "human", userId, organizationId: scope.organizationId });
  }
  return { people, external: normalized.filter((email) => !matched.has(email)) };
}

/** Only the owner adds their agent, and only an enabled agent, with its actor here. */
export async function ownedAgents(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  agentIds: string[],
): Promise<MemberActor[]> {
  if (agentIds.length > 20) throw new ValidationError("At most 20 agents are allowed.");
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
