import { newId } from "@substrate/contracts/ids";

import { AccessDeniedError, ValidationError, violatedConstraint } from "../../errors";
import { rootEntityValues } from "../entities/identity";
import { entities } from "../entities/schema";
import type { DatabaseExecutor } from "../executor";
import { member } from "../organizations/schema";
import { entityGrants } from "../permissions/schema";
import { actors } from "./schema";
import { userAgents } from "./user-agents.schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

type ActorInput = { organizationId: string } & (
  | { type: "human"; userId: string }
  | { type: "agent"; userAgentId?: string }
);

async function isMember(tx: DatabaseExecutor, input: { organizationId: string; userId: string }) {
  const [membership] = await tx
    .select()
    .from(member)
    .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)));
  return membership !== undefined;
}

export function createActor(db: DatabaseExecutor, input: ActorInput) {
  return db.transaction(async (tx) => {
    if (input.type === "human" && !(await isMember(tx, input)))
      throw new ValidationError("Human actors require organization membership.");
    const [entity] = await tx
      .insert(entities)
      .values(rootEntityValues(input.organizationId, "actor"))
      .returning();
    const [actor] = await tx
      .insert(actors)
      .values({
        entityId: entity!.entityId,
        organizationId: input.organizationId,
        type: input.type,
        userId: input.type === "human" ? input.userId : null,
        userAgentId: input.type === "agent" ? input.userAgentId : null,
      })
      .returning();
    if (input.type === "human") {
      await tx.insert(entityGrants).values({
        organizationId: input.organizationId,
        entityId: actor!.entityId,
        actorEntityId: actor!.entityId,
        level: "owner",
      });
    }
    return actor!;
  });
}

async function createOrReadActor(db: DatabaseExecutor, input: ActorInput) {
  try {
    return await createActor(db, input);
  } catch (error) {
    const constraint =
      input.type === "human"
        ? "actors_organization_user_unique"
        : "actors_organization_user_agent_unique";
    if (!(error instanceof Error) || violatedConstraint(error) !== constraint) throw error;
    const [existing] = await db
      .select()
      .from(actors)
      .where(
        and(
          eq(actors.organizationId, input.organizationId),
          input.type === "human"
            ? eq(actors.userId, input.userId)
            : eq(actors.userAgentId, input.userAgentId!),
        ),
      );
    if (!existing) throw error;
    return existing;
  }
}

export async function ensureUserAgentActor(
  db: DatabaseExecutor,
  input: { organizationId: string; userId: string; userAgentId: string },
) {
  const [existing] = await db
    .select({ actor: actors })
    .from(actors)
    .innerJoin(
      userAgents,
      and(
        eq(userAgents.id, actors.userAgentId),
        eq(userAgents.userId, input.userId),
        eq(userAgents.enabled, true),
        isNull(userAgents.deletedAt),
      ),
    )
    .innerJoin(
      member,
      and(eq(member.organizationId, actors.organizationId), eq(member.userId, input.userId)),
    )
    .where(
      and(
        eq(actors.organizationId, input.organizationId),
        eq(actors.userAgentId, input.userAgentId),
      ),
    );
  if (existing) return existing.actor;
  return db.transaction(async (tx) => {
    if (!(await isMember(tx, input))) throw new AccessDeniedError();
    const [agent] = await tx
      .select()
      .from(userAgents)
      .where(
        and(
          eq(userAgents.id, input.userAgentId),
          eq(userAgents.userId, input.userId),
          eq(userAgents.enabled, true),
          isNull(userAgents.deletedAt),
        ),
      );
    if (!agent) throw new AccessDeniedError();
    const [existing] = await tx
      .select()
      .from(actors)
      .where(
        and(
          eq(actors.organizationId, input.organizationId),
          eq(actors.userAgentId, input.userAgentId),
        ),
      );
    return (
      existing ??
      createOrReadActor(tx, {
        organizationId: input.organizationId,
        type: "agent",
        userAgentId: agent.id,
      })
    );
  });
}

export function ensureHumanActor(
  db: DatabaseExecutor,
  input: { organizationId: string; userId: string },
) {
  return db.transaction(async (tx) => {
    if (!(await isMember(tx, input)))
      throw new ValidationError("Human actors require organization membership.");
    const [existing] = await tx
      .select()
      .from(actors)
      .where(and(eq(actors.organizationId, input.organizationId), eq(actors.userId, input.userId)));
    return existing ?? createOrReadActor(tx, { ...input, type: "human" });
  });
}

async function insertMissingActors(
  tx: DatabaseExecutor,
  organizationId: string,
  identities: ({ type: "human"; userId: string } | { type: "agent"; userAgentId: string })[],
) {
  const rows = identities.map((identity) => ({
    entityId: newId(),
    organizationId,
    type: identity.type,
    userId: identity.type === "human" ? identity.userId : null,
    userAgentId: identity.type === "agent" ? identity.userAgentId : null,
  }));
  await tx
    .insert(entities)
    .values(rows.map((row) => rootEntityValues(organizationId, "actor", row.entityId)));
  const created = await tx.insert(actors).values(rows).onConflictDoNothing().returning();
  const kept = new Set(created.map((actor) => actor.entityId));
  const unused = rows.flatMap((row) => (kept.has(row.entityId) ? [] : [row.entityId]));
  if (unused.length)
    await tx
      .delete(entities)
      .where(and(eq(entities.organizationId, organizationId), inArray(entities.entityId, unused)));
  const humans = created.filter((actor) => actor.type === "human");
  if (humans.length)
    await tx.insert(entityGrants).values(
      humans.map((actor) => ({
        organizationId,
        entityId: actor.entityId,
        actorEntityId: actor.entityId,
        level: "owner" as const,
      })),
    );
  return { created, raced: unused.length > 0 };
}

export function ensureHumanActors(
  db: DatabaseExecutor,
  input: { organizationId: string; userIds: string[] },
) {
  const userIds = [...new Set(input.userIds)].sort();
  if (!userIds.length) return Promise.resolve([]);
  return db.transaction(async (tx) => {
    const memberships = await tx
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), inArray(member.userId, userIds)));
    const members = new Set(memberships.map((membership) => membership.userId));
    if (userIds.some((userId) => !members.has(userId)))
      throw new ValidationError("Human actors require organization membership.");
    const identity = and(
      eq(actors.organizationId, input.organizationId),
      inArray(actors.userId, userIds),
    );
    const existing = await tx.select().from(actors).where(identity);
    const found = new Set(existing.map((actor) => actor.userId));
    const missing = userIds.filter((userId) => !found.has(userId));
    if (!missing.length) return existing;
    const { created, raced } = await insertMissingActors(
      tx,
      input.organizationId,
      missing.map((userId) => ({ type: "human" as const, userId })),
    );
    return raced ? tx.select().from(actors).where(identity) : [...existing, ...created];
  });
}

export async function ensureOwnedAgentActors(
  db: DatabaseExecutor,
  input: { organizationId: string; userId: string },
) {
  const rows = await db
    .select({ membership: member.id, agentId: userAgents.id, actor: actors })
    .from(member)
    .leftJoin(
      userAgents,
      and(
        eq(userAgents.userId, member.userId),
        eq(userAgents.enabled, true),
        isNull(userAgents.deletedAt),
      ),
    )
    .leftJoin(
      actors,
      and(eq(actors.organizationId, member.organizationId), eq(actors.userAgentId, userAgents.id)),
    )
    .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
    .orderBy(userAgents.id);
  if (!rows.length) throw new AccessDeniedError();
  const existing = rows.flatMap((row) => (row.actor ? [row.actor] : []));
  if (rows.every((row) => row.agentId === null || row.actor)) return existing;
  return provisionOwnedAgentActors(db, input);
}

function provisionOwnedAgentActors(
  db: DatabaseExecutor,
  input: { organizationId: string; userId: string },
) {
  return db.transaction(async (tx) => {
    if (!(await isMember(tx, input))) throw new AccessDeniedError();
    const agents = await tx
      .select({ id: userAgents.id })
      .from(userAgents)
      .where(
        and(
          eq(userAgents.userId, input.userId),
          eq(userAgents.enabled, true),
          isNull(userAgents.deletedAt),
        ),
      )
      .orderBy(userAgents.id);
    if (!agents.length) return [];
    const identity = and(
      eq(actors.organizationId, input.organizationId),
      inArray(
        actors.userAgentId,
        agents.map((agent) => agent.id),
      ),
    );
    let found = await tx.select().from(actors).where(identity);
    const missing = agents.filter(
      (agent) => !found.some((actor) => actor.userAgentId === agent.id),
    );
    if (missing.length) {
      const { created, raced } = await insertMissingActors(
        tx,
        input.organizationId,
        missing.map((agent) => ({ type: "agent" as const, userAgentId: agent.id })),
      );
      found = raced ? await tx.select().from(actors).where(identity) : [...found, ...created];
    }
    const byAgent = new Map(found.map((actor) => [actor.userAgentId, actor]));
    return agents.flatMap((agent) => byAgent.get(agent.id) ?? []);
  });
}
