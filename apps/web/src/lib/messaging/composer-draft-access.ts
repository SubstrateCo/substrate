export function retainConversationDraft(
  conversationId: string,
  allowed: ReadonlySet<string>,
  discussions: ReadonlySet<string>,
  selectedId?: string,
) {
  if (selectedId) return conversationId !== selectedId || allowed.has(conversationId);
  return discussions.has(conversationId) || allowed.has(conversationId);
}
