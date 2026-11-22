import { interactionFields } from "@substrate/contracts/context/interactions";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { lockContact } from "../../core/contacts/access";
import { parseInput } from "../../core/contacts/inputs";
import { contactInteractionRepository } from "../../core/contacts/interactions.repository";
import { contactInteractions } from "../../core/contacts/interactions.schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { messageEntityReferences } from "../context/schema";
import { recordCrmActivity } from "../crm/activity";
import { presentInteraction } from "../crm/actor-views";
import { crmContactProfiles } from "../crm/schema";
import { requireMessage } from "../messaging/access";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const publicationInput = interactionFields.extend({
  messageId: z.uuid(),
  consentToContactAudience: z.literal(true),
});
export async function publishInteraction(
  context: RepositoryContext,
  input: z.input<typeof publicationInput>,
) {
  const value = parseInput(publicationInput, input);
  const { scope } = context;
  if (!scope.userId) throw new AccessDeniedError();
  const identity = { userId: scope.userId, organizationId: scope.organizationId };
  return context.transaction(async (ctx) => {
    const { message, conversation } = await requireMessage(
      ctx.db,
      identity,
      value.messageId,
      "share",
      async (conversation) => {
        await ctx.lockAccessPaths([
          value.contactEntityId,
          ...(conversation.taskEntityId ? [conversation.taskEntityId] : []),
        ]);
        if (conversation.taskEntityId) await ctx.requireAccess(conversation.taskEntityId, "view");
      },
    );
    if (conversation.organizationId !== scope.organizationId || message.deletedAt)
      throw new AccessDeniedError();
    const parent = await lockContact(ctx, value.contactEntityId);
    const [profile] = await ctx.db
      .select()
      .from(crmContactProfiles)
      .where(
        and(
          eq(crmContactProfiles.organizationId, scope.organizationId),
          eq(crmContactProfiles.contactEntityId, value.contactEntityId),
        ),
      );
    if (profile?.archivedAt) throw new ValidationError("Restore the contact first.");
    const occurredAt = new Date(value.occurredAt);
    const endedAt = value.endedAt ? new Date(value.endedAt) : null;
    if (endedAt && endedAt < occurredAt)
      throw new ValidationError("The end must not precede the start.");
    // A message is published once per contact; a repeat returns the earlier interaction unchanged.
    // The contact lock above serializes publishers, and the message's `source` reference finds it.
    const [existing] = await ctx.db
      .select({ entityId: contactInteractions.entityId })
      .from(contactInteractions)
      .innerJoin(
        messageEntityReferences,
        and(
          eq(messageEntityReferences.organizationId, contactInteractions.organizationId),
          eq(messageEntityReferences.entityId, contactInteractions.entityId),
          eq(messageEntityReferences.messageId, value.messageId),
          eq(messageEntityReferences.purpose, "source"),
        ),
      )
      .where(
        and(
          eq(contactInteractions.organizationId, scope.organizationId),
          eq(contactInteractions.contactEntityId, value.contactEntityId),
        ),
      );
    if (existing)
      return presentInteraction(
        ctx,
        await contactInteractionRepository(ctx).get(existing.entityId),
      );
    const entity = await ctx.createChildEntity("contact_interaction", parent);
    await ctx.db.insert(contactInteractions).values({
      entityId: entity.entityId,
      organizationId: scope.organizationId,
      entityType: "contact_interaction",
      contactEntityId: value.contactEntityId,
      kind: value.kind,
      occurredAt,
      endedAt,
      summary: value.summary,
      origin: "message_publication",
      createdByActorEntityId: scope.actorEntityId,
    });
    await ctx.db.insert(messageEntityReferences).values({
      organizationId: scope.organizationId,
      conversationId: conversation.id,
      messageId: value.messageId,
      entityId: entity.entityId,
      entityType: "contact_interaction",
      purpose: "source",
      createdByActorEntityId: scope.actorEntityId,
    });
    await ctx.touch(value.contactEntityId);
    await recordCrmActivity(ctx, {
      entityId: value.contactEntityId,
      action: "interaction_created",
      relatedEntityId: entity.entityId,
    });
    ctx.effects.hint({
      audience: realtimeKeys.entity(scope.organizationId, value.contactEntityId),
      domain: "context",
    });
    ctx.effects.hint({
      audience: realtimeKeys.conversation(conversation.id),
      domain: "context",
      messageId: message.id,
    });
    return presentInteraction(ctx, await contactInteractionRepository(ctx).get(entity.entityId));
  });
}
