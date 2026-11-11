import type { DatabaseExecutor } from "../../client";
import { AccessDeniedError, ValidationError } from "../../errors";
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

// Trusted session/credential identity only. Never accept the owner from tool input. An existing
// actor of a live, enabled agent whose owner is a member returns from one lock-free statement;
// only a missing actor takes the provisioning locks. Callers still check the actor is active.
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
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
      .for("update");
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
      )
      .for("update");
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
      createActor(tx, {
        organizationId: input.organizationId,
        type: "agent",
        userAgentId: agent.id,
      })
    );
  });
}

// Trusted auth hooks can run more than once. Lock membership to serialize provisioning.
export function ensureHumanActor(
  db: DatabaseExecutor,
  input: { organizationId: string; userId: string },
) {
  return db.transaction(async (tx) => {
    const [membership] = await tx
      .select()
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
      .for("update");
    if (!membership) throw new ValidationError("Human actors require organization membership.");
    const [existing] = await tx
      .select()
      .from(actors)
      .where(and(eq(actors.organizationId, input.organizationId), eq(actors.userId, input.userId)));
    return existing ?? createActor(tx, { ...input, type: "human" });
  });
}

// Trusted, already verified session identity only. One statement checks membership and reads
// the actor; only a missing actor takes the provisioning lock. Repositories still check that the
// actor is active.
export async function resolveHumanActor(
  db: DatabaseExecutor,
  input: { organizationId: string; userId: string },
) {
  const [row] = await db
    .select({ actor: actors })
    .from(member)
    .leftJoin(
      actors,
      and(eq(actors.organizationId, member.organizationId), eq(actors.userId, member.userId)),
    )
    .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)));
  if (!row) throw new AccessDeniedError();
  return row.actor ?? ensureHumanActor(db, input);
}

// Reads take one lock-free statement when every enabled agent already has an actor here. Only a
// missing actor takes the provisioning locks.
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
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
      .for("update");
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
      .orderBy(userAgents.id)
      .for("update");
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
          (await createActor(tx, {
            organizationId: input.organizationId,
            type: "agent",
            userAgentId: agent.id,
          })),
      );
    }
    return result;
  });
}
