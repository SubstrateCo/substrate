import type { CrmWrite } from "@substrate/contracts/crm/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { requireAppsEnabled } from "../../core/apps/access";
import { contactInteractions } from "../../core/contacts/interactions/interactions.schema";
import { relatedPair } from "../../core/links/repository";
import { entityLinks } from "../../core/links/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { previousRequest, recordRequest, requestFingerprint } from "../../core/requests/once";
import { AccessDeniedError, ValidationError } from "../../errors";
import { taskRepository } from "../tasks/repository";
import { tasks } from "../tasks/tasks.schema";
import { recordCrmActivity } from "./activity/activity";
import { crmAccounts, crmContactProfiles, crmDeals } from "./schema";
import { and, asc, eq, notInArray, or } from "drizzle-orm";

type Input = Extract<CrmWrite, { action: "createFollowUp" }>;
export async function createFollowUp(
  context: RepositoryContext,
  input: Omit<Input, "action" | "organizationId" | "consentToTaskAudience"> & {
    consentToTaskAudience: boolean;
  },
) {
  if (input.consentToTaskAudience !== true)
    throw new ValidationError("Confirm publication to the project's readers.");
  const { scope } = context;
  return context.transaction(async (ctx) => {
    await requireAppsEnabled(ctx, ["crm", "tasks"]);
    const fingerprint = requestFingerprint({
      source: input.entityId,
      project: input.projectEntityId,
      title: input.title,
      description: input.description ?? "",
      dueDate: input.dueDate ?? null,
      assignee: input.assigneeActorEntityId ?? null,
      status: input.status ?? "not_started",
      priority: input.priority ?? "none",
    });
    const previous = await previousRequest(ctx, "crm_follow_up", input.requestId, fingerprint);
    const { entity } = await ctx.requireAccess(input.entityId, "edit");
    if (!["contact", "account", "deal", "contact_interaction"].includes(entity.entityType))
      throw new ValidationError("Choose a CRM source.");
    if (previous) return taskRepository(ctx).get(previous);
    let archived = false;
    let activityEntityId = input.entityId;
    if (entity.entityType === "account") {
      const [row] = await ctx.db
        .select({ archivedAt: crmAccounts.archivedAt })
        .from(crmAccounts)
        .where(
          and(
            eq(crmAccounts.organizationId, scope.organizationId),
            eq(crmAccounts.entityId, input.entityId),
          ),
        );
      archived = !!row?.archivedAt;
    } else if (entity.entityType === "deal") {
      const [row] = await ctx.db
        .select({ archivedAt: crmDeals.archivedAt })
        .from(crmDeals)
        .where(
          and(
            eq(crmDeals.organizationId, scope.organizationId),
            eq(crmDeals.entityId, input.entityId),
          ),
        );
      archived = !!row?.archivedAt;
    } else {
      let contactId = input.entityId;
      if (entity.entityType === "contact_interaction") {
        const [interaction] = await ctx.db
          .select()
          .from(contactInteractions)
          .where(
            and(
              eq(contactInteractions.organizationId, scope.organizationId),
              eq(contactInteractions.entityId, input.entityId),
            ),
          );
        if (!interaction) throw new AccessDeniedError();
        contactId = interaction.contactEntityId;
      }
      const [row] = await ctx.db
        .select({ archivedAt: crmContactProfiles.archivedAt })
        .from(crmContactProfiles)
        .where(
          and(
            eq(crmContactProfiles.organizationId, scope.organizationId),
            eq(crmContactProfiles.contactEntityId, contactId),
          ),
        );
      archived = !!row?.archivedAt;
      activityEntityId = contactId;
    }
    if (archived) throw new ValidationError("Restore the CRM record first.");
    const task = await taskRepository(ctx).create(input);
    await recordRequest(ctx, "crm_follow_up", input.requestId, task.entityId);
    await ctx.db.insert(entityLinks).values({
      organizationId: scope.organizationId,
      ...relatedPair(task.entityId, input.entityId),
      relationType: "related_to",
      createdByActorEntityId: scope.actorEntityId,
    });
    ctx.effects.hint({
      audience: realtimeKeys.entity(scope.organizationId, input.entityId),
      domain: "context",
    });
    await recordCrmActivity(ctx, {
      entityId: activityEntityId,
      action: "follow_up_created",
      relatedEntityId: task.entityId,
    });
    return task;
  });
}

export async function followUps(context: RepositoryContext, entityId: string) {
  await requireAppsEnabled(context, ["crm", "tasks"]);
  await context.requireAccess(entityId, "view");
  const rows = await context.db
    .selectDistinct({
      entityId: tasks.entityId,
      projectEntityId: tasks.projectEntityId,
      title: tasks.title,
      status: tasks.status,
      dueDate: tasks.dueDate,
      assigneeActorEntityId: tasks.assigneeActorEntityId,
    })
    .from(entityLinks)
    .innerJoin(
      tasks,
      and(
        eq(tasks.organizationId, entityLinks.organizationId),
        or(
          and(
            eq(entityLinks.sourceEntityId, entityId),
            eq(tasks.entityId, entityLinks.targetEntityId),
          ),
          and(
            eq(entityLinks.targetEntityId, entityId),
            eq(tasks.entityId, entityLinks.sourceEntityId),
          ),
        ),
      ),
    )
    .where(
      and(
        eq(entityLinks.organizationId, context.scope.organizationId),
        eq(entityLinks.relationType, "related_to"),
        context.readable(tasks.entityId),
        notInArray(tasks.status, ["completed", "canceled"]),
      ),
    )
    .orderBy(asc(tasks.dueDate), asc(tasks.entityId))
    .limit(100);
  return {
    tasks: rows,
    nextAction: rows.find((row) => row.dueDate !== null) ?? null,
    scope: "readable linked open tasks; dueDate is date-only" as const,
  };
}
