import { realtimeKeys } from "@substrate/contracts/realtime";

import { requireAppEnabled } from "../../core/apps/access";
import type { RepositoryContext } from "../../core/repository-context";
import { ValidationError } from "../../errors";
import { crmSettings } from "./settings.schema";
import { eq } from "drizzle-orm";

export async function requireCrmAdmin(context: RepositoryContext) {
  await requireAppEnabled(context, "crm");
  await context.requireOrganizationAdmin();
}

/** Requires the scope's own actor to be a human admin; an owner's agent is refused. */
export async function requireHumanCrmAdmin(context: RepositoryContext) {
  await requireAppEnabled(context, "crm");
  await context.requireOrganizationAdmin({ human: true });
}

// pipelineVersion is internal to pipeline changes. This write must not reset it.
const publicSettings = {
  organizationId: crmSettings.organizationId,
  defaultCurrency: crmSettings.defaultCurrency,
};
export function settingsRepository(context: RepositoryContext) {
  return {
    async settings() {
      await requireAppEnabled(context, "crm");
      const [row] = await context.db
        .select(publicSettings)
        .from(crmSettings)
        .where(eq(crmSettings.organizationId, context.scope.organizationId));
      return row ?? { organizationId: context.scope.organizationId, defaultCurrency: null };
    },
    async updateSettings(input: { defaultCurrency: string | null }) {
      if (
        input.defaultCurrency !== null &&
        !Intl.supportedValuesOf("currency").includes(input.defaultCurrency)
      )
        throw new ValidationError("Choose a supported currency code.");
      return context.transaction(async (ctx) => {
        await requireCrmAdmin(ctx);
        const [row] = await ctx.db
          .insert(crmSettings)
          .values({
            organizationId: context.scope.organizationId,
            defaultCurrency: input.defaultCurrency,
          })
          .onConflictDoUpdate({
            target: crmSettings.organizationId,
            set: { defaultCurrency: input.defaultCurrency },
          })
          .returning(publicSettings);
        ctx.effects.hint({
          audience: realtimeKeys.organization(context.scope.organizationId),
          domain: "context",
        });
        return row!;
      });
    },
  };
}
