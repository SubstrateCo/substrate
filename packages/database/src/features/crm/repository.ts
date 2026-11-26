import { RepositoryContext } from "../../core/repository-context";
import { ValidationError } from "../../errors";
import { assignOwner } from "./access/ownership";
import { crmRecordAccess } from "./access/record-access";
import { crmSharing } from "./access/sharing";
import { crmAccountsRepository } from "./accounts";
import { recordCrmActivity, listCrmActivity } from "./activity/activity";
import { timeline } from "./activity/timeline";
import { crmAffiliationsRepository } from "./affiliations";
import { crmDealsRepository } from "./deals/deals";
import { crmExportAccess } from "./export-access";
import { createFollowUp, followUps } from "./follow-ups";
import { homeDeals } from "./home";
import { crmManagementRepository } from "./management";
import { crmPipelineRepository } from "./pipeline";
import { crmRecordLinks } from "./record-links";
import { report, reportDeals } from "./reporting/reports";
import { crmAccounts, crmDeals } from "./schema";
import { settingsRepository } from "./settings";
import { and, isNull, isNotNull, sql } from "drizzle-orm";

export function crmRepository(context: RepositoryContext) {
  const { changed, target } = crmRecordAccess(context);
  return {
    ...crmAccountsRepository(context),
    ...crmAffiliationsRepository(context),
    ...crmDealsRepository(context),
    ...crmPipelineRepository(context),
    ...crmManagementRepository(context),
    ...crmRecordLinks(context),
    ...crmExportAccess(context),
    home: (today: string) => homeDeals(context, today),
    activity: (id: string, options?: Parameters<typeof listCrmActivity>[2]) =>
      listCrmActivity(context, id, options),
    assignOwner: (id: string, input: Parameters<typeof assignOwner>[2]) =>
      assignOwner(context, id, input),
    ...crmSharing(context),
    timeline: (id: string, options?: Parameters<typeof timeline>[2]) =>
      timeline(context, id, options),
    ...settingsRepository(context),
    createFollowUp: (input: Parameters<typeof createFollowUp>[1]) => createFollowUp(context, input),
    followUps: (id: string) => followUps(context, id),
    report: (from: Date, to: Date, options?: Parameters<typeof report>[3]) =>
      report(context, from, to, options),
    reportDeals: (input: Parameters<typeof reportDeals>[1]) => reportDeals(context, input),
    async archive(id: string, archived: boolean) {
      return context.transaction(async (ctx) => {
        const access = await ctx.requireAccess(id, "edit");
        const { entity } = access;
        if (entity.entityType !== "account" && entity.entityType !== "deal")
          throw new ValidationError("This record cannot be archived in CRM.");
        const table = entity.entityType === "account" ? crmAccounts : crmDeals;
        const archivedAt = archived ? new Date() : null;
        const set =
          entity.entityType === "account"
            ? { archivedAt }
            : { archivedAt, version: sql`${crmDeals.version} + 1` };
        await ctx.touch(id);
        // The old state is in the WHERE, so one of two concurrent calls records the change.
        const [flipped] = await ctx.db
          .update(table)
          .set(set)
          .where(
            and(
              target(table, id),
              archived ? isNull(table.archivedAt) : isNotNull(table.archivedAt),
            ),
          )
          .returning({ entityId: table.entityId });
        if (!flipped) await ctx.db.update(table).set(set).where(target(table, id));
        changed(ctx, id);
        if (flipped)
          await recordCrmActivity(
            ctx,
            { entityId: id, action: archived ? "archived" : "restored" },
            access,
          );
      });
    },
  };
}
