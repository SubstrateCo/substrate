import { realtimeKeys } from "@substrate/contracts/realtime";

import { requireAppEnabled } from "../../core/apps/access";
import { linkRepository } from "../../core/links/repository";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { contextTargetsOf } from "../context/target-page";
import { recordCrmActivity } from "./activity/activity";
import { crmAccounts, crmContactProfiles, crmDeals } from "./schema";
import { and, eq } from "drizzle-orm";

async function sourceAccess(ctx: RepositoryContext, entityId: string, edit: boolean) {
  const access = await ctx.requireAccess(entityId, edit ? "edit" : "view");
  const type = access.entity.entityType;
  const crmSource = ["account", "deal", "contact", "contact_interaction"].includes(type);
  const workBacklink = !edit && (type === "project" || type === "task");
  if (!crmSource && !workBacklink) throw new AccessDeniedError();
  if (type === "account" || type === "deal") await requireAppEnabled(ctx, "crm");
  if (!(await contextTargetsOf(ctx, [entityId])).has(entityId)) throw new AccessDeniedError();
  if (edit) {
    let table: typeof crmAccounts | typeof crmDeals | typeof crmContactProfiles =
      crmContactProfiles;
    if (type === "account") table = crmAccounts;
    if (type === "deal") table = crmDeals;
    const contact = type === "contact_interaction" ? access.entity.accessEntityId : entityId;
    const column = "contactEntityId" in table ? table.contactEntityId : table.entityId;
    const [record] = await ctx.db
      .select({ archivedAt: table.archivedAt })
      .from(table)
      .where(and(eq(table.organizationId, ctx.scope.organizationId), eq(column, contact)));
    if (record?.archivedAt) throw new ValidationError("Restore the archived record first.");
  }
  return access;
}

export function crmRecordLinks(context: RepositoryContext) {
  return {
    async recordLinks(entityId: string) {
      const access = await sourceAccess(context, entityId, false);
      const links = await linkRepository(context).list(entityId, { limit: 100 }, access);
      const related = links.filter((link) => link.relationType === "related_to");
      const ids = related.map((link) =>
        link.sourceEntityId === entityId ? link.targetEntityId : link.sourceEntityId,
      );
      const targets = await contextTargetsOf(context, ids);
      return related.flatMap((link, index) => {
        const id = ids[index]!;
        const target = targets.get(id);
        return target ? [{ id: link.id, entityId: id, ...target }] : [];
      });
    },
    async changeRecordLink(entityId: string, otherEntityId: string, remove: boolean) {
      return context.transaction(async (ctx) => {
        const access = await sourceAccess(ctx, entityId, true);
        const targets = await contextTargetsOf(ctx, [otherEntityId]);
        if (!targets.has(otherEntityId)) throw new AccessDeniedError();
        const links = linkRepository(ctx);
        const input = { entityId, otherEntityId };
        if (remove) await links.remove(input);
        else await links.create(input);
        for (const id of [entityId, otherEntityId])
          ctx.effects.hint({
            audience: realtimeKeys.entity(ctx.scope.organizationId, id),
            domain: "context",
          });
        await recordCrmActivity(ctx, {
          entityId:
            access.entity.entityType === "contact_interaction"
              ? access.entity.accessEntityId
              : entityId,
          action: remove ? "context_unlinked" : "context_linked",
          relatedEntityId: otherEntityId,
        });
        return { entityId, otherEntityId };
      });
    },
  };
}
