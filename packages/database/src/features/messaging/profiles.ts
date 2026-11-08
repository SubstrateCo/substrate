import { managedPicture, managedPicturePath } from "@startup-os/contracts/files/pictures";

import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { AccessDeniedError } from "../../errors";
import { visibleConversations, type MessagingIdentity } from "./access";
import { messagingConversations, messagingMessages, messagingParticipants } from "./schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

interface MessagingProfile {
  id: string;
  type: "human" | "agent";
  name: string;
  self: boolean;
  external: boolean;
  email: string | null;
  image: string | null;
  role: string | null;
  directConversationId: string | null;
  agent: { ownerName: string | null; harness: string | null; model: string | null } | null;
}

// A viewer may see an actor's profile only through a conversation they can see,
// when the actor wrote in it or is an active workspace actor with access to it.
async function requireProfileContext(
  tx: DatabaseExecutor,
  scope: MessagingIdentity,
  conversationId: string,
  actor: typeof actors.$inferSelect,
) {
  const [conversation] = await tx
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .where(and(eq(messagingConversations.id, conversationId), visibleConversations(tx, scope)));
  if (!conversation) throw new AccessDeniedError();
  const [authored] = await tx
    .select({ id: messagingMessages.id })
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.conversationId, conversationId),
        eq(messagingMessages.authorActorEntityId, actor.entityId),
      ),
    )
    .limit(1);
  if (authored) return;
  if (actor.organizationId !== scope.organizationId) throw new AccessDeniedError();
  let userId = actor.userId;
  if (actor.type === "agent") {
    // Before a local agent writes, only its owner can resolve it. It sees what its owner sees.
    const [definition] = actor.userAgentId
      ? await tx
          .select({ userId: userAgents.userId })
          .from(userAgents)
          .where(eq(userAgents.id, actor.userAgentId))
      : [];
    if (!definition || definition.userId !== scope.userId) throw new AccessDeniedError();
    userId = definition.userId;
  }
  const [present] = await tx
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .innerJoin(actors, eq(actors.entityId, actor.entityId))
    .innerJoin(entities, eq(entities.entityId, actors.entityId))
    .where(
      and(
        eq(messagingConversations.id, conversationId),
        activeActorCondition(),
        isNull(entities.deletedAt),
        visibleConversations(tx, { userId: userId ?? "", organizationId: scope.organizationId }),
      ),
    );
  if (!present) throw new AccessDeniedError();
}

async function directConversationId(
  tx: DatabaseExecutor,
  scope: MessagingIdentity,
  userId: string,
) {
  const viewer = alias(messagingParticipants, "viewer");
  const target = alias(messagingParticipants, "target");
  const [row] = await tx
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .innerJoin(
      viewer,
      and(
        eq(viewer.conversationId, messagingConversations.id),
        eq(viewer.userId, scope.userId),
        eq(viewer.organizationId, scope.organizationId),
      ),
    )
    .innerJoin(
      target,
      and(eq(target.conversationId, messagingConversations.id), eq(target.userId, userId)),
    )
    .where(
      and(
        eq(messagingConversations.kind, "dm"),
        eq(messagingConversations.organizationId, scope.organizationId),
      ),
    )
    .orderBy(desc(messagingConversations.createdAt))
    .limit(1);
  return row?.id ?? null;
}

// The caller has authenticated the session scope and resolved the viewer's actor.
export async function messagingProfile(
  tx: DatabaseExecutor,
  scope: MessagingIdentity,
  viewerActorEntityId: string,
  conversationId: string,
  actorEntityId: string,
): Promise<MessagingProfile> {
  const [actor] = await tx.select().from(actors).where(eq(actors.entityId, actorEntityId));
  if (!actor) throw new AccessDeniedError();
  await requireProfileContext(tx, scope, conversationId, actor);
  const base = { id: actor.entityId, type: actor.type, name: actor.name };
  const self = actor.entityId === viewerActorEntityId;
  if (actor.type === "human") {
    // Only fellow members of the viewer's workspace show contact details and role.
    const [person] = await tx
      .select({ email: user.email, image: user.image, role: member.role })
      .from(user)
      .innerJoin(
        member,
        and(eq(member.userId, user.id), eq(member.organizationId, scope.organizationId)),
      )
      .where(eq(user.id, actor.userId!));
    const image = managedPicture.safeParse(person?.image ?? null);
    return {
      ...base,
      self,
      external: !person,
      email: person?.email ?? null,
      image: person && image.success ? image.data : null,
      role: person?.role ?? null,
      directConversationId:
        person && !self && !scope.actorEntityId
          ? await directConversationId(tx, scope, actor.userId!)
          : null,
      agent: null,
    };
  }
  const [definition] = actor.userAgentId
    ? await tx
        .select({
          ownerId: userAgents.userId,
          harness: userAgents.harness,
          model: userAgents.model,
          imageFileId: userAgents.imageFileId,
        })
        .from(userAgents)
        .where(eq(userAgents.id, actor.userAgentId))
    : [];
  const [owner] = definition
    ? await tx
        .select({ name: user.name })
        .from(user)
        .innerJoin(
          member,
          and(eq(member.userId, user.id), eq(member.organizationId, scope.organizationId)),
        )
        .where(eq(user.id, definition.ownerId))
    : [];
  // Agent configuration and pictures stay private to the agent's owner.
  const owned = !!definition && definition.ownerId === scope.userId;
  return {
    ...base,
    self,
    external: actor.organizationId !== scope.organizationId,
    email: null,
    image: owned ? managedPicturePath(definition.imageFileId) : null,
    role: null,
    directConversationId: null,
    agent: {
      ownerName: owner?.name ?? null,
      harness: owned ? definition.harness : null,
      model: owned ? definition.model : null,
    },
  };
}
