import { realtimeKeys } from "@substrate/contracts/realtime";

import { parseInput } from "../../core/contacts/inputs";
import { contactInteractionRepository } from "../../core/contacts/interactions.repository";
import type { RepositoryContext } from "../../core/repository-context";
import { recordCrmActivity } from "./activity";
import { presentInteraction } from "./actor-views";
import { z } from "zod";

export function crmInteractionActions(context: RepositoryContext) {
  return {
    updateInteraction(entityId: string, input: { summary: string }) {
      const value = parseInput(z.object({ summary: z.string().trim().min(1).max(10000) }), input);
      return context.transaction(async (ctx) => {
        await ctx.requireAccess(entityId, "edit", true, "structural");
        const repo = contactInteractionRepository(ctx);
        const previous = await repo.get(entityId);
        if (previous.summary === value.summary) return presentInteraction(ctx, previous);
        const interaction = await repo.update(entityId, value);
        await recordCrmActivity(ctx, {
          entityId: interaction.contactEntityId,
          action: "interaction_updated",
          changedFields: ["summary"],
          relatedEntityId: entityId,
        });
        ctx.effects.hint({
          audience: realtimeKeys.entity(ctx.scope.organizationId, interaction.contactEntityId),
          domain: "context",
        });
        return presentInteraction(ctx, interaction);
      });
    },
    deleteInteraction(entityId: string) {
      return context.transaction(async (ctx) => {
        await ctx.requireAccess(entityId, "owner", true, "structural");
        const repo = contactInteractionRepository(ctx);
        const previous = await repo.get(entityId);
        await repo.softDelete(entityId);
        await recordCrmActivity(ctx, {
          entityId: previous.contactEntityId,
          action: "interaction_deleted",
        });
        ctx.effects.hint({
          audience: realtimeKeys.entity(ctx.scope.organizationId, previous.contactEntityId),
          domain: "context",
        });
        return { entityId };
      });
    },
  };
}
