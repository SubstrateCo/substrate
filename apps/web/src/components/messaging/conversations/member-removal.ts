import type { HeaderMember } from "./conversation-header";
import type { Conversation } from "@/lib/messaging/conversations";

export function canRemoveMember(conversation: Conversation, userId: string, member: HeaderMember) {
  return (
    !conversation.task &&
    conversation.canManage &&
    conversation.kind !== "dm" &&
    member.type === "human" &&
    member.organizationId === conversation.organizationId &&
    member.userId !== userId &&
    member.userId !== conversation.createdBy
  );
}
