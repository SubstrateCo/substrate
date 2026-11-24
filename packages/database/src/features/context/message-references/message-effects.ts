import { actors } from "../../../core/actors/schema";
import { entities } from "../../../core/entities/schema";
import type { RepositoryContext } from "../../../core/repository-context";
import type { SessionIdentity } from "../../../core/session/identity";
import { messageReferences } from "../../../core/text/references";
import { AccessDeniedError, ValidationError } from "../../../errors";
import {
  liveAgentMember,
  liveApprovedParticipant,
  mentionablePerson,
} from "../../messaging/access";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../../messaging/schema";
import { notify } from "../../notifications/effects";
import { readableWorkTargets } from "../../notifications/targets";
import { messageEntityReferences } from "../schema";
import { checkMessagingReferences } from "./messaging-references";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

// `referenced` reports saved work or messaging references, and `work` the referenced tasks and
// projects. `notified` lists the alerts created.
export async function applyMessageEffects(
  ctx: RepositoryContext,
  scope: SessionIdentity,
  message: typeof messagingMessages.$inferSelect,
  conversation: Pick<typeof messagingConversations.$inferSelect, "organizationId" | "kind"> & {
    taskEntityId?: string | null;
  },
  options: { delivery?: boolean } = {},
): Promise<{
  referenced: boolean;
  work: { entityId: string; projectEntityId: string }[];
  notified: { organizationId: string; actorId: string }[];
}> {
  const { db } = ctx;
  const { organizationId: conversationOrganizationId } = conversation;
  const work: { entityId: string; projectEntityId: string }[] = [];
  if (message.deletedAt) return { referenced: false, work, notified: [] };
  const recipients = new Map<string, "mention" | "reply" | "message">();
  const personIds: string[] = [];
  const agentIds: string[] = [];
  const workReferences: { id: string; kind: "task" | "project" }[] = [];
  const messagingReferences: { id: string; kind: "channel" | "thread" }[] = [];
  for (const reference of messageReferences(message.body)) {
    if (reference.kind === "channel" || reference.kind === "thread")
      messagingReferences.push({ id: reference.id, kind: reference.kind });
    else if (reference.kind === "person") personIds.push(reference.id);
    else if (reference.kind === "agent") agentIds.push(reference.id);
    else workReferences.push({ id: reference.id, kind: reference.kind });
  }
  await checkMessagingReferences(db, scope, conversationOrganizationId, messagingReferences);
  let referenced = messagingReferences.length > 0;
  if (agentIds.length) {
    // A mentioned agent must be an active member of this conversation. Mentions notify nobody;
    // only the owner's mention can start a run, which the trigger evaluator decides.
    const members = await db
      .select({ id: messagingParticipants.actorEntityId })
      .from(messagingParticipants)
      .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
      .innerJoin(
        entities,
        and(
          eq(entities.entityId, actors.entityId),
          eq(entities.organizationId, actors.organizationId),
        ),
      )
      .where(
        and(
          liveAgentMember(message.conversationId),
          inArray(messagingParticipants.actorEntityId, agentIds),
          isNull(entities.deletedAt),
        ),
      );
    if (members.length !== agentIds.length)
      throw new ValidationError("Add the agent to this conversation before you mention it.");
  }
  if (personIds.length) {
    // Every mentioned person must be an active workspace member who can see this conversation.
    const people = await db
      .select({ userId: sql<string>`${actors.userId}` })
      .from(actors)
      .innerJoin(
        entities,
        and(
          eq(entities.entityId, actors.entityId),
          eq(entities.organizationId, actors.organizationId),
        ),
      )
      .innerJoin(messagingConversations, eq(messagingConversations.id, message.conversationId))
      .where(and(inArray(actors.entityId, personIds), mentionablePerson(db, scope.organizationId)));
    if (people.length !== personIds.length) throw new AccessDeniedError();
    for (const person of people) recipients.set(person.userId, "mention");
  }
  if (workReferences.length) {
    if (conversationOrganizationId !== scope.organizationId) throw new AccessDeniedError();
    // The caller has verified the active actor; this applies view access to the task and its project.
    const targets = await readableWorkTargets(
      ctx,
      workReferences.map((reference) => reference.id),
    );
    for (const reference of workReferences) {
      const target = targets.get(reference.id);
      if (target?.entityType !== reference.kind) throw new AccessDeniedError();
      work.push({ entityId: reference.id, projectEntityId: target.projectEntityId });
    }
    await db
      .insert(messageEntityReferences)
      .values(
        workReferences.map((reference) => ({
          organizationId: scope.organizationId,
          conversationId: message.conversationId,
          messageId: message.id,
          entityId: reference.id,
          entityType: reference.kind,
          purpose: "mention" as const,
          createdByActorEntityId: ctx.scope.actorEntityId,
        })),
      )
      .onConflictDoNothing();
    referenced = true;
  }
  // Edits validate and replace derived references, but never deliver a new message event.
  if (options.delivery === false) return { referenced, work, notified: [] };
  if (message.threadId && !conversation.taskEntityId) {
    // Members who left get mention alerts only.
    const authors = await db
      .selectDistinct({ userId: actors.userId })
      .from(messagingMessages)
      .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
      .innerJoin(
        messagingParticipants,
        and(
          eq(messagingParticipants.conversationId, messagingMessages.conversationId),
          eq(messagingParticipants.actorEntityId, messagingMessages.authorActorEntityId),
        ),
      )
      .where(
        and(
          eq(messagingMessages.conversationId, message.conversationId),
          isNull(messagingMessages.deletedAt),
          or(
            eq(messagingMessages.id, message.threadId),
            eq(messagingMessages.threadId, message.threadId),
          ),
          isNull(messagingParticipants.leftAt),
        ),
      );
    for (const author of authors)
      if (author.userId && !recipients.has(author.userId)) recipients.set(author.userId, "reply");
  }
  const ordinaryRecipients =
    conversation.kind === "channel" || conversation.taskEntityId
      ? []
      : await db
          .selectDistinct({ userId: actors.userId })
          .from(messagingParticipants)
          .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
          .innerJoin(
            messagingConversations,
            eq(messagingConversations.id, messagingParticipants.conversationId),
          )
          .where(
            and(
              eq(messagingConversations.id, message.conversationId),
              inArray(messagingConversations.kind, ["dm", "group"]),
              eq(actors.type, "human"),
              liveApprovedParticipant(db),
            ),
          );
  for (const person of ordinaryRecipients)
    if (person.userId && !recipients.has(person.userId)) recipients.set(person.userId, "message");
  if (!scope.actorEntityId) recipients.delete(scope.userId);
  if (!recipients.size) return { referenced, work, notified: [] };
  const notified = await notify(
    ctx,
    (["mention", "reply", "message"] as const).map((kind) => ({
      kind,
      recipients: [...recipients].flatMap(([userId, recipientKind]) =>
        recipientKind === kind ? [{ userId }] : [],
      ),
    })),
    {
      messageId: message.id,
      conversationId: message.conversationId,
      conversationOrganizationId,
      eventKey: message.id,
    },
  );
  return { referenced, work, notified };
}
