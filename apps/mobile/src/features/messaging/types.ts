import type {
  getMessagePage,
  getOrganizationPeople,
  listAgents,
  searchContext,
} from "./api/context";
import type { listConversations, listManagedConversations } from "./api/conversations";
import type { listMessages } from "./api/messages";
import type { getSharingDetails, getSharingInvitation, listSharingInbox } from "./api/sharing";

export type Conversation = Awaited<ReturnType<typeof listConversations>>[number];
export type ManagedConversation = Awaited<ReturnType<typeof listManagedConversations>>[number];
export type ConversationKind = Conversation["kind"];
export type ConversationMember = Conversation["members"][number];
export type Message = Awaited<ReturnType<typeof listMessages>>[number];
export type MessageAttachment = Message["attachments"][number];
export type MessageReaction = Message["reactions"][number];
export type MessageContext = Awaited<ReturnType<typeof getMessagePage>>[number];
export type LinkedWork = MessageContext["links"][number];
export type SearchResult = Awaited<ReturnType<typeof searchContext>>[number];
export type WorkspacePerson = Awaited<ReturnType<typeof getOrganizationPeople>>[number];
export type Agent = Awaited<ReturnType<typeof listAgents>>["agents"][number];
export type SharingDetails = Awaited<ReturnType<typeof getSharingDetails>>;
export type SharingRequest = Awaited<ReturnType<typeof listSharingInbox>>[number];
export type SharingInvitation = Awaited<ReturnType<typeof getSharingInvitation>>;

export type MessagingConversationTarget = { conversationId: string; threadId?: string };

export type MessagingProfileTarget = {
  organizationId: string;
  conversationId: string;
  actorId: string;
};

export type MessageSource = {
  kind: "task" | "crm" | "interaction";
  organizationId: string;
  conversationId: string;
  messageId: string;
};
