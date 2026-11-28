import {
  isOwner,
  ownerCandidates as hostOwnerCandidates,
} from "@substrate/contracts/messaging/permissions";

import type {
  Conversation,
  ConversationMember,
  ManagedConversation,
  WorkspacePerson,
} from "../types";
import { humanMembers } from "./conversation-rules";

export function leaveOwnerCandidates(conversation: Conversation, viewerId: string) {
  if (!isOwner(conversation, viewerId)) return [];
  return ownerCandidates(conversation);
}

export function ownerCandidates(
  conversation: Pick<Conversation, "members" | "organizationId" | "createdBy">,
) {
  return humanMembers(hostOwnerCandidates(conversation));
}

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
