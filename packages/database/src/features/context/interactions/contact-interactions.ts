import { realtimeKeys } from "@substrate/contracts/realtime";

import { interactionWorkspaceRepository } from "../../../core/contacts/interactions/interaction-workspace.repository";
import { contactInteractionRepository } from "../../../core/contacts/interactions/interactions.repository";
import { appEnabledCondition } from "../../../core/permissions/app-visibility";
import type { RepositoryContext } from "../../../core/repository-context";
import { ValidationError } from "../../../errors";
import { recordCrmActivity } from "../../crm/activity/activity";
import { presentInteraction, presentInteractions } from "../../crm/activity/actor-views";
import { interactionScope } from "../../crm/activity/timeline";
import { crmContactProfiles } from "../../crm/schema";
import { contextInteractionActions } from "./interaction-actions";
import { interactionCalendarFilter } from "./interaction-calendar-filter";
import { interactionDirectoryPage } from "./interaction-directory";
import { publishInteraction } from "./interaction-publication";
import { interactionProfileDetail, interactionRecordDetail } from "./interaction-records";
import { and, eq } from "drizzle-orm";

export function contextContactInteractionRepository(context: RepositoryContext) {
  return {
    ...contactInteractionRepository(context),
    ...contextInteractionActions(context),
    workspaceActivity: (
      input: Parameters<ReturnType<typeof interactionWorkspaceRepository>["workspaceActivity"]>[0],
    ) =>
      interactionWorkspaceRepository(context).workspaceActivity(
        input,
        interactionCalendarFilter(context, input.sourceCalendarEntityId),
      ),
    workspaceDirectory: (input: Parameters<typeof interactionDirectoryPage>[1]) =>
      interactionDirectoryPage(context, input),
    workspaceRecord: (id: string) => interactionRecordDetail(context, id),
    workspaceProfile: (id: string, type: "person" | "account") =>
      interactionProfileDetail(context, id, type),
    async workspaceTimeline(
      input: Parameters<ReturnType<typeof interactionWorkspaceRepository>["workspaceTimeline"]>[0],
    ) {
      let condition;
      if (input.contactEntityId)
        await context.requireAccess(input.contactEntityId, "edit", { type: "contact" });
      if (input.accountEntityId) {
        await context.requireAccess(input.accountEntityId, "view", { type: "account" });
        condition = interactionScope(
          context,
          "account",
          input.accountEntityId,
          input.scope === "linked",
        );
      }
      const page = await interactionWorkspaceRepository(context).workspaceTimeline(
        input,
        and(condition, interactionCalendarFilter(context, input.sourceCalendarEntityId)),
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
        const contact = await ctx.requireAccess(input.contactEntityId, "edit", { type: "contact" });
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
        const interaction = await contactInteractionRepository(ctx).createManual(input, contact);
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
