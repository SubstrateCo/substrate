import type { HeaderMember } from "./conversation-header";
import type { Conversation } from "@/lib/messaging/conversations";

export function canRemoveMember(
  conversation: Pick<
    Conversation,
    "task" | "canManage" | "kind" | "joined" | "organizationId" | "createdBy"
  >,
  userId: string,
  member: HeaderMember,
) {
  if (member.type === "agent") {
    return (
      !conversation.task && conversation.kind !== "dm" && !!conversation.joined && !!member.agentId
    );
  }
  return (
    !conversation.task &&
    conversation.canManage &&
    conversation.kind !== "dm" &&
    member.organizationId === conversation.organizationId &&
    member.userId !== userId &&
    member.userId !== conversation.createdBy
  );
}
