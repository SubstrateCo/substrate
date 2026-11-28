import type { AgentAvatarCode } from "@substrate/contracts/agents";
import { managedPicture } from "@substrate/contracts/files/pictures";

import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import type { DatabaseExecutor } from "../../core/executor";
import { member } from "../../core/organizations/schema";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError } from "../../errors";
import { liveAgentMember, visibleConversations } from "./access";
import { directConversationId } from "./conversations/direct-messages";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
  messagingReactions,
} from "./schema";
import { and, eq, exists, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

interface MessagingProfile {
  id: string;
  type: "human" | "agent";
  name: string;
  self: boolean;
  external: boolean;
  email: string | null;
  image: string | null;
  avatar: AgentAvatarCode | null;
  role: string | null;
  directConversationId: string | null;
  agent: {
    ownerName: string | null;
    harness: string | null;
    model: string | null;
  } | null;
}

async function profileActor(db: DatabaseExecutor, scope: SessionIdentity, actorEntityId: string) {
  const personMember = alias(member, "person_member");
  const personUser = alias(user, "person_user");
  const ownerMember = alias(member, "owner_member");
  const ownerUser = alias(user, "owner_user");
  const [row] = await db
    .select({
      actor: actors,
      name: sql<string>`case when ${actors.type} = 'agent'
        then coalesce(${userAgents.name}, 'Agent') else ${personUser.name} end`,
      membership: personMember.id,
      email: personUser.email,
      image: personUser.image,
      role: personMember.role,
      definition: {
        ownerId: userAgents.userId,
        harness: userAgents.harness,
        model: userAgents.model,
        avatarCode: userAgents.avatarCode,
      },
      ownerName: ownerUser.name,
    })
    .from(actors)
    .leftJoin(
      personMember,
      and(
        eq(personMember.userId, actors.userId),
        eq(personMember.organizationId, scope.organizationId),
      ),
    )
    .leftJoin(personUser, eq(personUser.id, actors.userId))
    .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
    .leftJoin(
      ownerMember,
      and(
        eq(ownerMember.userId, userAgents.userId),
        eq(ownerMember.organizationId, scope.organizationId),
      ),
    )
    .leftJoin(ownerUser, eq(ownerUser.id, ownerMember.userId))
    .where(eq(actors.entityId, actorEntityId));
  if (!row) throw new AccessDeniedError();
  const { membership, email, image, role, ...rest } = row;
  return { ...rest, person: membership ? { email: email!, image, role: role! } : null };
}

async function requireProfileContext(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  conversationId: string,
  { actor, definition }: Awaited<ReturnType<typeof profileActor>>,
) {
  const userId = actor.type === "agent" ? definition?.ownerId : actor.userId;
  const presentAllowed =
    actor.organizationId === scope.organizationId &&
    !!userId &&
    (actor.type === "human" || userId === scope.userId);
  const [conversation] = await db
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .where(
      and(
        eq(messagingConversations.id, conversationId),
        visibleConversations(db, scope),
        or(
          exists(
            db
              .select({ id: messagingReactions.actorEntityId })
              .from(messagingReactions)
              .where(
                and(
                  eq(messagingReactions.conversationId, conversationId),
                  eq(messagingReactions.actorEntityId, actor.entityId),
                ),
              ),
          ),
          exists(
            db
              .select({ id: messagingMessages.id })
              .from(messagingMessages)
              .where(
                and(
                  eq(messagingMessages.conversationId, conversationId),
                  eq(messagingMessages.authorActorEntityId, actor.entityId),
                ),
              ),
          ),
          actor.type === "agent"
            ? exists(
                db
                  .select({ id: actors.entityId })
                  .from(messagingParticipants)
                  .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
                  .innerJoin(entities, eq(entities.entityId, actors.entityId))
                  .where(
                    and(
                      liveAgentMember(conversationId),
                      eq(actors.entityId, actor.entityId),
                      isNull(entities.deletedAt),
                    ),
                  ),
              )
            : undefined,
          presentAllowed
            ? exists(
                db
                  .select({ id: actors.entityId })
                  .from(actors)
                  .innerJoin(entities, eq(entities.entityId, actors.entityId))
                  .where(
                    and(
                      eq(actors.entityId, actor.entityId),
                      activeActorCondition(),
                      isNull(entities.deletedAt),
                      visibleConversations(db, { userId, organizationId: scope.organizationId }),
                    ),
                  ),
              )
            : undefined,
        ),
      ),
    );
  if (!conversation) throw new AccessDeniedError();
}

export async function messagingProfile(
  tx: DatabaseExecutor,
  scope: SessionIdentity,
  viewerActorEntityId: string,
  conversationId: string,
  actorEntityId: string,
): Promise<MessagingProfile> {
  const found = await profileActor(tx, scope, actorEntityId);
  await requireProfileContext(tx, scope, conversationId, found);
  const { actor, name, person, definition, ownerName } = found;
  const base = { id: actor.entityId, type: actor.type, name };
  const self = actor.entityId === viewerActorEntityId;
  if (actor.type === "human") {
    const image = managedPicture.safeParse(person?.image ?? null);
    return {
      ...base,
      self,
      external: !person,
      email: person?.email ?? null,
      image: person && image.success ? image.data : null,
      avatar: null,
      role: person?.role ?? null,
      directConversationId:
        person && !self && !scope.actorEntityId
          ? await directConversationId(tx, scope.organizationId, viewerActorEntityId, actor.userId!)
          : null,
      agent: null,
    };
  }
  const owned = !!definition && definition.ownerId === scope.userId;
  return {
    ...base,
    self,
    external: actor.organizationId !== scope.organizationId,
    email: null,
    image: null,
    avatar: definition?.avatarCode ?? null,
    role: null,
    directConversationId: null,
    agent: {
      ownerName: definition ? ownerName : null,
      harness: owned ? definition.harness : null,
      model: owned ? definition.model : null,
    },
  };
}
