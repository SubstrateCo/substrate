import type {
  Conversation,
  ConversationMember,
  ManagedConversation,
  WorkspacePerson,
} from "../types";
import { humanMembers } from "./conversation-rules";

// Who may own or join a conversation. Leave and remove rules are in
// `@substrate/contracts/messaging/permissions`.

/** The owner leaving must hand ownership to another person first, when there is one. */
export function leaveOwnerCandidates(conversation: Conversation, viewerId: string) {
  const owner = conversation.createdBy === viewerId && conversation.canManage;
  if (!owner) return [];
  return ownerCandidates(conversation);
}

/** Ownership stays in the host organization, even when partners share the conversation. */
export function ownerCandidates(
  conversation: Pick<Conversation, "members" | "organizationId" | "createdBy">,
) {
  return humanMembers(
    conversation.members.filter((member) => member.organizationId === conversation.organizationId),
  ).filter((person) => person.userId !== conversation.createdBy);
}

/** Managed metadata omits organization IDs. Only current host-directory members can own it. */
export function managedOwnerCandidates(
  conversation: Pick<ManagedConversation, "members" | "ownerUserId">,
  people: readonly Pick<WorkspacePerson, "userId" | "name">[],
) {
  const memberIds = new Set(
    conversation.members.flatMap((member) =>
      member.type === "human" && member.userId ? [member.userId] : [],
    ),
  );
  return people.filter(
    (person) => memberIds.has(person.userId) && person.userId !== conversation.ownerUserId,
  );
}

/** Add-members never adds its acting user; do not offer a no-op self-add to metadata-only admins. */
export function managedMemberChoices(
  people: readonly Pick<WorkspacePerson, "userId" | "name" | "email" | "image">[],
  members: readonly Pick<ConversationMember, "userId">[],
  viewerId: string,
) {
  const memberIds = new Set(members.flatMap((member) => (member.userId ? [member.userId] : [])));
  return people.flatMap((person) =>
    person.userId !== viewerId && !memberIds.has(person.userId)
      ? [{ id: person.userId, name: person.name, email: person.email, image: person.image }]
      : [],
  );
}
