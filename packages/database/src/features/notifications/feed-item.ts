export interface FeedRow {
  id: string;
  kind: "assignment" | "mention" | "reply";
  readAt: Date | null;
  createdAt: Date;
  entityId: string | null;
  messageId: string | null;
  /** Set when the work target is readable now. */
  work: { title: string; projectEntityId: string } | null;
  /** Set when the message's conversation is visible now. */
  conversationId: string | null;
}

/** A feed row as the recipient sees it, or null when its target is no longer readable. */
export function toFeedItem(row: FeedRow) {
  const base = { id: row.id, kind: row.kind, readAt: row.readAt, createdAt: row.createdAt };
  if (row.entityId) {
    if (!row.work) return null;
    return {
      ...base,
      title: row.work.title,
      entityId: row.entityId,
      projectEntityId: row.work.projectEntityId,
      conversationId: null,
      messageId: null,
    };
  }
  if (!row.messageId || !row.conversationId) return null;
  return {
    ...base,
    title: row.kind === "mention" ? "You were mentioned" : "New thread reply",
    entityId: null,
    projectEntityId: null,
    conversationId: row.conversationId,
    messageId: row.messageId,
  };
}
