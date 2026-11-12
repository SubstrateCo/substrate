import type { DatabaseExecutor } from "../../client";
import { AccessDeniedError, ValidationError, violatedConstraint } from "../../errors";
import { rootEntityValues } from "../entities/identity";
import { entities } from "../entities/schema";
import { member } from "../organizations/schema";
import { entityGrants } from "../permissions/schema";
import { actors } from "./schema";
import { userAgents } from "./user-agents.schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

type ActorInput = { organizationId: string } & (
  | { type: "human"; userId: string }
  | { type: "agent"; userAgentId?: string }
);

// Trusted provisioning only: call from authenticated onboarding or organization-admin workflows.
export function createActor(db: DatabaseExecutor, input: ActorInput) {
  return db.transaction(async (tx) => {
    if (input.type === "human") {
      const [membership] = await tx
        .select()
        .from(member)
        .where(
          and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)),
        );
      if (!membership) throw new ValidationError("Human actors require organization membership.");
    }
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
    // createActor's nested transaction rolls back the entity and grant on an identity conflict.
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

// Trusted session/credential identity only. Never accept the owner from tool input. An existing
// actor of a live, enabled agent whose owner is a member returns from one lock-free statement;
// a missing actor uses the unique identity constraint. Callers still check the actor is active.
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
    const [membership] = await tx
      .select()
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)));
    if (!membership) throw new AccessDeniedError();
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

// Trusted auth hooks can run more than once. The unique identity constraint arbitrates creation.
export function ensureHumanActor(
  db: DatabaseExecutor,
  input: { organizationId: string; userId: string },
) {
  return db.transaction(async (tx) => {
    const [membership] = await tx
      .select()
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)));
    if (!membership) throw new ValidationError("Human actors require organization membership.");
    const [existing] = await tx
      .select()
      .from(actors)
      .where(and(eq(actors.organizationId, input.organizationId), eq(actors.userId, input.userId)));
    return existing ?? createOrReadActor(tx, { ...input, type: "human" });
  });
}

// Reads take one statement when every enabled agent already has an actor here. Missing actors
// use the unique identity constraint without locking membership or agent configuration.
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
    const [membership] = await tx
      .select()
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)));
    if (!membership) throw new AccessDeniedError();
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
    const existing = await tx
      .select()
      .from(actors)
      .where(
        and(
          eq(actors.organizationId, input.organizationId),
          inArray(
            actors.userAgentId,
            agents.map((agent) => agent.id),
          ),
        ),
      );
    const byAgent = new Map(existing.map((actor) => [actor.userAgentId, actor]));
    const result = [];
    for (const agent of agents) {
      result.push(
        byAgent.get(agent.id) ??
          (await createOrReadActor(tx, {
            organizationId: input.organizationId,
            type: "agent",
            userAgentId: agent.id,
          })),
      );
    }
    return result;
  });
}
