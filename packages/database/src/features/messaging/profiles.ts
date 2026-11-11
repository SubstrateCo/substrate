import { managedPicture, managedPicturePath } from "@substrate/contracts/files/pictures";

import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { actorDisplayName } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError } from "../../errors";
import { visibleConversations } from "./access";
import { directConversationId } from "./direct-messages";
import { messagingConversations, messagingMessages, messagingReactions } from "./schema";
import { and, eq, exists, isNull, or } from "drizzle-orm";
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

// The actor with what the viewer may learn about it: contact details of fellow workspace members,
// and an agent's definition and owner. The caller decides what to reveal.
async function profileActor(db: DatabaseExecutor, scope: SessionIdentity, actorEntityId: string) {
  const personMember = alias(member, "person_member");
  const personUser = alias(user, "person_user");
  const ownerMember = alias(member, "owner_member");
  const ownerUser = alias(user, "owner_user");
  const [row] = await db
    .select({
      actor: actors,
      name: actorDisplayName(),
      membership: personMember.id,
      email: personUser.email,
      image: personUser.image,
      role: personMember.role,
      definition: {
        ownerId: userAgents.userId,
        harness: userAgents.harness,
        model: userAgents.model,
        imageFileId: userAgents.imageFileId,
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
    .leftJoin(personUser, eq(personUser.id, personMember.userId))
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

// A viewer may see an actor's profile only through a conversation they can see, when the actor
// wrote in it or is an active workspace actor with access to it. Before a local agent writes,
// only its owner can resolve it; it sees what its owner sees.
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

// The caller has authenticated the session scope and resolved the viewer's actor.
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
    // Only fellow members of the viewer's workspace show contact details and role.
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
          ? await directConversationId(tx, scope.organizationId, viewerActorEntityId, actor.userId!)
          : null,
      agent: null,
    };
  }
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
      ownerName: definition ? ownerName : null,
      harness: owned ? definition.harness : null,
      model: owned ? definition.model : null,
    },
  };
}
