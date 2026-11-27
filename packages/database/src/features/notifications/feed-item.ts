import type { AgentAvatarCode } from "@substrate/contracts/agents";
import type { ConversationKind } from "@substrate/contracts/messaging/input";

export interface FeedRow {
  id: string;
  kind: "assignment" | "mention" | "reply" | "message";
  readAt: Date | null;
  createdAt: Date;
  entityId: string | null;
  messageId: string | null;
  /** Set when the work target is readable now. */
  work: { title: string; projectEntityId: string; projectName: string } | null;
  /** Set when the message's conversation is visible now. */
  conversationId: string | null;
  /** The visible conversation, as the recipient sees it, and the message excerpt. */
  conversation: {
    name: string;
    kind: ConversationKind;
    private: boolean;
    excerpt: string;
  } | null;
  /** The thread root of a reply, or null for a top-level message. */
  threadId: string | null;
  /** Who acted: the message author or the person who assigned the task. */
  actorName: string | null;
  actorImage: string | null;
  /** Set when the actor is an agent. */
  actorAvatar: AgentAvatarCode | null;
}

/** A feed row as the recipient sees it, or null when its target is no longer readable. */
export function toFeedItem(row: FeedRow) {
  const base = {
    id: row.id,
    kind: row.kind,
    readAt: row.readAt,
    createdAt: row.createdAt,
    actorName: row.actorName,
    actorImage: row.actorImage,
    actorAvatar: row.actorAvatar,
  };
  if (row.entityId) {
    if (!row.work) return null;
    return {
      ...base,
      title: row.work.title,
      entityId: row.entityId,
      projectEntityId: row.work.projectEntityId,
      conversationId: null,
      messageId: null,
      threadId: null,
      source: { kind: "project" as const, name: row.work.projectName },
      excerpt: null,
    };
  }
  if (!row.messageId || !row.conversationId || !row.conversation) return null;
  const titles = {
    mention: "You were mentioned",
    message: "New message",
    reply: "New thread reply",
    assignment: "New thread reply",
  };
  return {
    ...base,
    title: titles[row.kind],
    entityId: null,
    projectEntityId: null,
    conversationId: row.conversationId,
    messageId: row.messageId,
    threadId: row.threadId,
    source: {
      kind: row.conversation.kind,
      name: row.conversation.name,
      private: row.conversation.private,
    },
    excerpt: row.conversation.excerpt,
  };
}
