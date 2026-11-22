import { realtimeKeys } from "@substrate/contracts/realtime";

import { lockContact, requireContact } from "../../core/contacts/access";
import { interactionWorkspaceRepository } from "../../core/contacts/interaction-workspace.repository";
import { contactInteractionRepository } from "../../core/contacts/interactions.repository";
import { appEnabledCondition } from "../../core/permissions/app-visibility";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { ValidationError } from "../../errors";
import { recordCrmActivity } from "../crm/activity";
import { presentInteraction, presentInteractions } from "../crm/actor-views";
import { crmContactProfiles } from "../crm/schema";
import { interactionScope } from "../crm/timeline";
import { contextInteractionActions } from "./interaction-actions";
import { interactionDirectoryPage } from "./interaction-directory";
import { publishInteraction } from "./interaction-publication";
import { interactionProfileDetail, interactionRecordDetail } from "./interaction-records";
import { and, eq } from "drizzle-orm";

export function contextContactInteractionRepository(context: RepositoryContext) {
  return {
    ...contactInteractionRepository(context),
    ...contextInteractionActions(context),
    workspaceDirectory: (input: Parameters<typeof interactionDirectoryPage>[1]) =>
      interactionDirectoryPage(context, input),
    workspaceRecord: (id: string) => interactionRecordDetail(context, id),
    workspaceProfile: (id: string, type: "person" | "account") =>
      interactionProfileDetail(context, id, type),
    async workspaceTimeline(
      input: Parameters<ReturnType<typeof interactionWorkspaceRepository>["workspaceTimeline"]>[0],
    ) {
      let condition;
      if (input.contactEntityId) await requireContact(context, input.contactEntityId);
      if (input.accountEntityId) {
        const access = await context.requireAccess(input.accountEntityId, "view");
        if (access.entity.entityType !== "account") throw new AccessDeniedError();
        condition = interactionScope(
          context,
          "account",
          input.accountEntityId,
          input.scope === "linked",
        );
      }
      const page = await interactionWorkspaceRepository(context).workspaceTimeline(
        input,
        condition,
      );
      return { ...page, items: await presentInteractions(context, page.items) };
    },
    publishInteraction: (input: Parameters<typeof publishInteraction>[1]) =>
      publishInteraction(context, input),
    listInteractions: async (
      id: string,
      options?: Parameters<ReturnType<typeof contactInteractionRepository>["listForContact"]>[1],
    ) =>
      presentInteractions(
        context,
        await contactInteractionRepository(context).listForContact(id, options),
      ),
    createInteraction(
      input: Parameters<ReturnType<typeof contactInteractionRepository>["createManual"]>[0],
    ) {
      return context.transaction(async (ctx) => {
        await lockContact(ctx, input.contactEntityId);
        const [profile] = await ctx.db
          .select()
          .from(crmContactProfiles)
          .where(
            and(
              eq(crmContactProfiles.organizationId, ctx.scope.organizationId),
              eq(crmContactProfiles.contactEntityId, input.contactEntityId),
              appEnabledCondition(ctx.scope.organizationId, "crm"),
            ),
          );
        if (profile?.archivedAt) throw new ValidationError("Restore the archived record first.");
        const interaction = await contactInteractionRepository(ctx).createManual(input);
        await recordCrmActivity(ctx, {
          entityId: input.contactEntityId,
          action: "interaction_created",
          relatedEntityId: interaction.entityId,
        });
        ctx.effects.hint({
          audience: realtimeKeys.entity(ctx.scope.organizationId, input.contactEntityId),
          domain: "context",
        });
        return presentInteraction(ctx, interaction);
      });
    },
  };
}
