export function excerpt(body: string, maximum = 1000) {
  return body.length > maximum
    ? { text: body.slice(0, maximum), truncated: true }
    : { text: body, truncated: false };
}

export function iso(value: Date | string) {
  return new Date(value).toISOString();
}

export function messageRef(row: { id: string; conversationId: string; threadId: string | null }) {
  return {
    type: "message" as const,
    id: row.id,
    conversationId: row.conversationId,
    threadId: row.threadId,
  };
}
