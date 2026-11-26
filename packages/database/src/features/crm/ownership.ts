import type { CrmWrite } from "@substrate/contracts/crm/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { parseInput } from "../../core/contacts/inputs";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { recordCrmActivity } from "./activity";
import { crmAccounts, crmDeals } from "./schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

type Input = Omit<
  Extract<CrmWrite, { action: "assignOwner" }>,
  "action" | "organizationId" | "entityId"
>;
export async function assignOwner(context: RepositoryContext, id: string, input: Input) {
  return context.transaction(async (ctx) => {
    // Responsibility is a structural change: concurrent reassignments of one record conflict.
    const access = await ctx.requireStructuralAccess(id, "edit");
    const { entity } = access;
    if (entity.entityType !== "account" && entity.entityType !== "deal")
      throw new AccessDeniedError();
    const responsible = await ctx.requireActiveActor(input.ownerActorEntityId);
    if (responsible.type !== "human")
      throw new ValidationError("Responsibility requires an active organization human.");
    const table = entity.entityType === "account" ? crmAccounts : crmDeals;
    const where = and(eq(table.organizationId, ctx.scope.organizationId), eq(table.entityId, id));
    const [previous] = await ctx.db.select().from(table).where(where);
    if (!previous) throw new AccessDeniedError();
    if (previous.ownerActorEntityId !== input.expectedOwnerActorEntityId)
      throw new ConflictError("Responsibility changed. Reload and try again.");
    if ("version" in previous) {
      if (input.expectedVersion === undefined)
        throw new ValidationError("Supply the deal's expectedVersion.");
      if (previous.version !== input.expectedVersion)
        throw new ConflictError("The deal changed. Supply its current version.");
    }
    parseInput(z.enum(["keep_restricted", "require_existing_access"]), input.accessDecision);
    if (
      input.accessDecision === "require_existing_access" &&
      !(await ctx.actorCanAccess(responsible.entityId, id, "view"))
    )
      throw new ValidationError(
        "The responsible person cannot read this record. Share it separately or explicitly keep access restricted.",
      );
    if (previous.ownerActorEntityId === responsible.entityId)
      return { entityId: id, ownerActorEntityId: responsible.entityId };
    const ownerActorEntityId = responsible.entityId;
    if (entity.entityType === "deal" && "version" in previous) {
      // A deal edit does not claim the structural version, so the write checks the deal version.
      const [row] = await ctx.db
        .update(crmDeals)
        .set({ ownerActorEntityId, version: previous.version + 1 })
        .where(
          and(
            eq(crmDeals.organizationId, ctx.scope.organizationId),
            eq(crmDeals.entityId, id),
            eq(crmDeals.version, previous.version),
          ),
        )
        .returning({ entityId: crmDeals.entityId });
      if (!row) throw new ConflictError("The deal changed. Supply its current version.");
    } else
      await ctx.db
        .update(crmAccounts)
        .set({ ownerActorEntityId })
        .where(
          and(
            eq(crmAccounts.organizationId, ctx.scope.organizationId),
            eq(crmAccounts.entityId, id),
          ),
        );
    await ctx.touch(id);
    await recordCrmActivity(
      ctx,
      { entityId: id, action: "owner_changed", changedFields: ["owner"] },
      access,
    );
    ctx.effects.hint({
      audience: realtimeKeys.entity(ctx.scope.organizationId, id),
      domain: "context",
    });
    return { entityId: id, ownerActorEntityId };
  });
}
