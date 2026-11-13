import { realtimeKeys } from "@substrate/contracts/realtime";

import { contactInteractionRepository } from "../../core/contacts/interactions.repository";
import type { RepositoryContext } from "../../core/repository-context";
import { ValidationError } from "../../errors";
import { recordCrmActivity } from "../crm/activity";
import { presentInteraction, presentInteractions } from "../crm/actor-views";
import { crmContactProfiles } from "../crm/schema";
import { contextInteractionActions } from "./interaction-actions";
import { publishInteraction } from "./interaction-publication";
import { and, eq } from "drizzle-orm";

export function contextContactInteractionRepository(context: RepositoryContext) {
  return {
    ...contactInteractionRepository(context),
    ...contextInteractionActions(context),
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
        await ctx.lockAccessPath(input.contactEntityId);
        await ctx.requireAccess(input.contactEntityId, "edit");
        const [profile] = await ctx.db
          .select()
          .from(crmContactProfiles)
          .where(
            and(
              eq(crmContactProfiles.organizationId, ctx.scope.organizationId),
              eq(crmContactProfiles.contactEntityId, input.contactEntityId),
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
