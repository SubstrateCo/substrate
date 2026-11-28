import type { RecordLabel } from "@substrate/contracts/context/input";

import { activeActorCondition, visibleActorCondition } from "../../core/actors/access";
import { actorDisplayName } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import { enabledApps } from "../../core/apps/access";
import { contactAddresses, contactUrls } from "../../core/contacts/details.schema";
import { contactIdentifiers } from "../../core/contacts/schema";
import { entities } from "../../core/entities/schema";
import { entityLinks } from "../../core/links/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { crmStages } from "../crm/schema";
import { visibleConversations } from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { readableTargetsOf } from "./target-page";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

const label = (
  id: string,
  type: RecordLabel["type"],
  title: string,
  place: { projectId?: string | null; conversationId?: string | null } = {},
): RecordLabel => ({
  id,
  type,
  title,
  projectId: place.projectId ?? null,
  conversationId: place.conversationId ?? null,
});

const excerpt = (text: string) => (text.length > 120 ? `${text.slice(0, 119)}…` : text);

/**
 * Names for record IDs, such as those a proposal's input names, for the reader to recognize.
 * Each ID is looked up as a record, conversation, message, person or agent, pipeline stage, task
 * link or contact detail, with the access rules the views use. IDs the reader cannot open are
 * left out, so a missing ID tells nothing about the record.
 */
export async function recordLabels(
  ctx: RepositoryContext,
  scope: SessionIdentity,
  ids: string[],
): Promise<RecordLabel[]> {
  const organizationId = ctx.scope.organizationId;
  const found = new Map<string, RecordLabel>();
  const missing = () => [...new Set(ids)].filter((id) => !found.has(id));

  for (const [id, target] of await readableTargetsOf(ctx, ids))
    found.set(
      id,
      label(id, target.entityType, target.title, { projectId: target.projectEntityId }),
    );

  if (missing().length) {
    const people = await ctx.db
      .select({ id: actors.entityId, name: actorDisplayName() })
      .from(actors)
      .innerJoin(
        entities,
        and(
          eq(entities.organizationId, actors.organizationId),
          eq(entities.entityId, actors.entityId),
          isNull(entities.deletedAt),
        ),
      )
      .where(
        and(
          eq(actors.organizationId, organizationId),
          inArray(actors.entityId, missing()),
          activeActorCondition(),
          visibleActorCondition(ctx.scope),
        ),
      );
    for (const person of people) found.set(person.id, label(person.id, "actor", person.name));
  }

  if (missing().length) {
    const conversations = await ctx.db
      .select({ id: messagingConversations.id, name: conversationDisplayName(ctx.db, scope) })
      .from(messagingConversations)
      .where(
        and(
          eq(messagingConversations.organizationId, organizationId),
          inArray(messagingConversations.id, missing()),
          visibleConversations(ctx.db, scope),
        ),
      );
    for (const { id, name } of conversations)
      found.set(id, label(id, "conversation", name, { conversationId: id }));
  }

  if (missing().length) {
    const messages = await ctx.db
      .select({
        id: messagingMessages.id,
        body: messagingMessages.body,
        conversationId: messagingMessages.conversationId,
      })
      .from(messagingMessages)
      .innerJoin(
        messagingConversations,
        eq(messagingConversations.id, messagingMessages.conversationId),
      )
      .where(
        and(
          eq(messagingConversations.organizationId, organizationId),
          inArray(messagingMessages.id, missing()),
          isNull(messagingMessages.deletedAt),
          visibleConversations(ctx.db, scope),
        ),
      );
    for (const message of messages)
      found.set(
        message.id,
        label(message.id, "message", excerpt(message.body), {
          conversationId: message.conversationId,
        }),
      );
  }

  if (missing().length && (await enabledApps(ctx)).includes("crm")) {
    const stages = await ctx.db
      .select({ id: crmStages.id, name: crmStages.name })
      .from(crmStages)
      .where(and(eq(crmStages.organizationId, organizationId), inArray(crmStages.id, missing())));
    for (const stage of stages) found.set(stage.id, label(stage.id, "pipeline_stage", stage.name));
  }

  if (missing().length) {
    const links = await ctx.db
      .select({
        id: entityLinks.id,
        sourceId: entityLinks.sourceEntityId,
        targetId: entityLinks.targetEntityId,
        relation: entityLinks.relationType,
      })
      .from(entityLinks)
      .where(
        and(eq(entityLinks.organizationId, organizationId), inArray(entityLinks.id, missing())),
      );
    const ends = await readableTargetsOf(
      ctx,
      links.flatMap((link) => [link.sourceId, link.targetId]),
    );
    for (const link of links) {
      const source = ends.get(link.sourceId);
      const target = ends.get(link.targetId);
      if (source?.entityType !== "task" || target?.entityType !== "task") continue;
      found.set(
        link.id,
        label(
          link.id,
          "task_link",
          `${source.title} ${link.relation.replace("_", " ")} ${target.title}`,
          {
            projectId: source.projectEntityId,
          },
        ),
      );
    }
  }

  if (missing().length) {
    const rest = missing();
    const details = [
      ...(await ctx.db
        .select({
          id: contactIdentifiers.id,
          contactId: contactIdentifiers.contactEntityId,
          title: contactIdentifiers.value,
        })
        .from(contactIdentifiers)
        .where(
          and(
            eq(contactIdentifiers.organizationId, organizationId),
            inArray(contactIdentifiers.id, rest),
          ),
        )),
      ...(await ctx.db
        .select({
          id: contactAddresses.id,
          contactId: contactAddresses.contactEntityId,
          title: sql<string>`coalesce(${contactAddresses.formattedAddress}, concat_ws(', ', ${contactAddresses.streetAddress}, ${contactAddresses.city}, ${contactAddresses.region}, ${contactAddresses.postalCode}, ${contactAddresses.countryCode}))`,
        })
        .from(contactAddresses)
        .where(
          and(
            eq(contactAddresses.organizationId, organizationId),
            inArray(contactAddresses.id, rest),
          ),
        )),
      ...(await ctx.db
        .select({
          id: contactUrls.id,
          contactId: contactUrls.contactEntityId,
          title: contactUrls.url,
        })
        .from(contactUrls)
        .where(and(eq(contactUrls.organizationId, organizationId), inArray(contactUrls.id, rest)))),
    ];
    const owners = await readableTargetsOf(
      ctx,
      details.map((detail) => detail.contactId),
    );
    for (const detail of details)
      if (owners.get(detail.contactId)?.entityType === "contact")
        found.set(detail.id, label(detail.id, "contact_detail", detail.title));
  }

  return [...new Set(ids)].flatMap((id) => {
    const item = found.get(id);
    return item ? [item] : [];
  });
}
