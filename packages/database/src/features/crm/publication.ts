import { interactionFields } from "@substrate/contracts/crm/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { parseInput } from "../../core/contacts/inputs";
import { contactInteractionRepository } from "../../core/contacts/interactions.repository";
import { contactInteractions } from "../../core/contacts/interactions.schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { messageEntityReferences } from "../context/schema";
import { requireMessage } from "../messaging/access";
import { recordCrmActivity } from "./activity";
import { presentInteraction } from "./actor-views";
import { crmInteractionPublications } from "./publications.schema";
import { crmContactProfiles } from "./schema";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
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
    const parent = await ctx.requireAccess(value.contactEntityId, "edit", true);
    if (parent.entity.entityType !== "contact") throw new AccessDeniedError();
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
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          kind: value.kind,
          occurredAt: occurredAt.toISOString(),
          endedAt: endedAt?.toISOString() ?? null,
          summary: value.summary,
        }),
      )
      .digest("hex");
    const [existing] = await ctx.db
      .select()
      .from(crmInteractionPublications)
      .where(
        and(
          eq(crmInteractionPublications.organizationId, scope.organizationId),
          eq(crmInteractionPublications.contactEntityId, value.contactEntityId),
          eq(crmInteractionPublications.messageId, value.messageId),
        ),
      );
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new ConflictError("This message was already published with different input.");
      return presentInteraction(
        ctx,
        await contactInteractionRepository(ctx).get(existing.interactionEntityId),
      );
    }
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
    await ctx.db.insert(crmInteractionPublications).values({
      organizationId: scope.organizationId,
      contactEntityId: value.contactEntityId,
      interactionEntityId: entity.entityId,
      messageId: value.messageId,
      conversationId: conversation.id,
      publisherActorEntityId: scope.actorEntityId,
      fingerprint,
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
