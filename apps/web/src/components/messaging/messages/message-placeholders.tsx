/** The author's name, or a placeholder when the message has none. */
export function messageAuthorName(message: { authorName?: string | null }) {
  return message.authorName || "Unknown member";
}

/** Stands in for the body of a deleted message. */
export function DeletedMessageBody() {
  return <p className="text-sm text-muted-foreground italic">Message deleted</p>;
}
