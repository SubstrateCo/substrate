import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../client";
import { ValidationError } from "../../errors";
import { actors } from "./schema";
import { entities } from "../entities/schema";
import { entityGrants } from "../permissions/schema";
import { member } from "../organizations/schema";

type ActorInput = { organizationId: string; name: string } & (
  | { type: "human"; userId: string }
  | { type: "agent"; agentConfig?: NonNullable<typeof actors.$inferInsert.agentConfig> }
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
        agentConfig: input.type === "agent" ? input.agentConfig : null,
      })
      .returning();
    await tx.insert(entityGrants).values({
      organizationId: input.organizationId,
      entityId: actor!.entityId,
      actorEntityId: actor!.entityId,
      level: "owner",
    });
    return actor!;
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
