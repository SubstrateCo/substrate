import { crmWrite } from "@substrate/contracts/crm/input";

import { requireAppEnabled } from "../../core/apps/access";
import { parseInput } from "../../core/contacts/inputs";
import { RepositoryContext } from "../../core/repository-context";
import { ConflictError, ValidationError } from "../../errors";
import { crmStages, crmDeals } from "./schema";
import { requireHumanCrmAdmin } from "./settings";
import { crmSettings } from "./settings.schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

export function crmPipelineRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const org = scope.organizationId;
  async function stages(ctx: RepositoryContext) {
    return ctx.db
      .select()
      .from(crmStages)
      .where(eq(crmStages.organizationId, org))
      .orderBy(asc(crmStages.position));
  }
  async function claimPipeline(ctx: RepositoryContext) {
    const [settings] = await ctx.db
      .select({ version: crmSettings.pipelineVersion })
      .from(crmSettings)
      .where(eq(crmSettings.organizationId, org));
    const [claimed] = await ctx.db
      .insert(crmSettings)
      .values({ organizationId: org, pipelineVersion: 1 })
      .onConflictDoUpdate({
        target: crmSettings.organizationId,
        set: { pipelineVersion: sql`${crmSettings.pipelineVersion} + 1` },
        setWhere: eq(crmSettings.pipelineVersion, settings?.version ?? 0),
      })
      .returning({ version: crmSettings.pipelineVersion });
    return !!claimed;
  }
  return {
    async configureStages(stages: { id?: string; name: string }[]) {
      const value = parseInput(
        crmWrite.options.find((option) => option.shape.action.value === "configureStages")!,
        { organizationId: org, action: "configureStages", stages },
      );
      if (value.action !== "configureStages") throw new ValidationError("Invalid stages.");
      const ids = stages.flatMap((stage) => (stage.id ? [stage.id] : []));
      if (new Set(ids).size !== ids.length) throw new ValidationError("Stage IDs must be unique.");
      return context.transaction(async (ctx) => {
        await requireHumanCrmAdmin(ctx);
        if (!(await claimPipeline(ctx)))
          throw new ConflictError("The pipeline changed. Reload and try again.");
        const existing = await ctx.db
          .select()
          .from(crmStages)
          .where(eq(crmStages.organizationId, org));
        if (ids.some((id) => !existing.some((stage) => stage.id === id)))
          throw new ValidationError("Unknown stage.");
        const removed = existing.flatMap((stage) => (ids.includes(stage.id) ? [] : [stage.id]));
        if (removed.length) {
          const [used] = await ctx.db
            .select({ id: crmDeals.entityId })
            .from(crmDeals)
            .where(
              and(
                eq(crmDeals.organizationId, org),
                inArray(crmDeals.stageId, removed),
                eq(crmDeals.outcome, "open"),
              ),
            )
            .limit(1);
          if (used) throw new ConflictError("Move open deals before retiring a stage.");
          await ctx.db
            .update(crmStages)
            .set({ retired: true })
            .where(and(eq(crmStages.organizationId, org), inArray(crmStages.id, removed)));
        }
        const positioned = stages.map((stage, position) => ({ ...stage, position }));
        const kept = positioned.filter((stage) => stage.id);
        if (kept.length)
          await ctx.db.execute(sql`update ${crmStages}
            set name = v.name, position = v.position, retired = false
            from (values ${sql.join(
              kept.map(
                (stage) =>
                  sql`(${stage.id}::uuid, ${stage.name}::text, ${stage.position}::integer)`,
              ),
              sql`, `,
            )}) as v(id, name, position)
            where ${crmStages.organizationId} = ${org} and ${crmStages.id} = v.id`);
        const added = positioned.filter((stage) => !stage.id);
        if (added.length)
          await ctx.db.insert(crmStages).values(
            added.map((stage) => ({
              organizationId: org,
              name: stage.name,
              position: stage.position,
            })),
          );
        return ctx.db
          .select()
          .from(crmStages)
          .where(eq(crmStages.organizationId, org))
          .orderBy(asc(crmStages.position));
      });
    },
    async pipeline() {
      await requireAppEnabled(context, "crm");
      return db
        .select()
        .from(crmStages)
        .where(eq(crmStages.organizationId, org))
        .orderBy(asc(crmStages.position), asc(crmStages.id));
    },
    async ensurePipeline() {
      return context.transaction(async (ctx) => {
        await requireAppEnabled(ctx, "crm");
        const existing = await stages(ctx);
        if (existing.length) return existing;
        const claimed = await claimPipeline(ctx);
        const rows = await stages(ctx);
        if (rows.length) return rows;
        if (!claimed) throw new ConflictError("The pipeline changed. Reload and try again.");
        return ctx.db
          .insert(crmStages)
          .values(
            ["Qualification", "Discovery", "Proposal", "Negotiation"].map((name, position) => ({
              organizationId: org,
              name,
              position,
            })),
          )
          .returning();
      });
    },
  };
}
