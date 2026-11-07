import type { DatabaseExecutor } from "../../client";
import { AccessDeniedError, ValidationError } from "../../errors";
import { entities } from "../entities/schema";
import { member } from "../organizations/schema";
import { entityGrants } from "../permissions/schema";
import { actors } from "./schema";
import { userAgents } from "./user-agents.schema";
import { and, eq, isNull } from "drizzle-orm";

type ActorInput = { organizationId: string; name: string } & (
  | { type: "human"; userId: string }
  | {
      type: "agent";
      agentConfig?: NonNullable<typeof actors.$inferInsert.agentConfig>;
      userAgentId?: string;
    }
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
      .values({ organizationId: input.organizationId, entityType: "actor" })
      .returning();
    const [actor] = await tx
      .insert(actors)
      .values({
        entityId: entity!.entityId,
        organizationId: input.organizationId,
        name: input.name,
        type: input.type,
        userId: input.type === "human" ? input.userId : null,
        userAgentId: input.type === "agent" ? input.userAgentId : null,
        agentConfig: input.type === "agent" ? input.agentConfig : null,
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

// Trusted session/credential identity only. Never accept the owner from tool input.
export function ensureUserAgentActor(
  db: DatabaseExecutor,
  input: { organizationId: string; userId: string; userAgentId: string },
) {
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
        name: agent.name,
      })
    );
  });
}

// Trusted auth hooks can run more than once. Lock membership to serialize provisioning.
export function ensureHumanActor(
  db: DatabaseExecutor,
  input: { organizationId: string; userId: string; name: string },
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
