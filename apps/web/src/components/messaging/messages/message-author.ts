/** The author's name, or a placeholder when the message has none. */
export function messageAuthorName(message: { authorName?: string | null }) {
  return message.authorName || "Unknown member";
}
