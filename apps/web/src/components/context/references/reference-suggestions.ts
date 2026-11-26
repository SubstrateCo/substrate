/**
 * Rows from the picker's previous search that still fit the current text and tab, shown while the
 * current search loads. The previous search came from the same conversation, because a picker
 * belongs to one composer, so these rows need no new access check. Every row shown matches the
 * text, so Enter never inserts a stale result.
 */
export function narrowedSuggestions<T extends { kind: string; title: string }>(
  rows: readonly T[] | undefined,
  kinds: readonly string[],
  query: string,
): T[] | undefined {
  if (!rows) return undefined;
  const text = query.trim().toLowerCase();
  return rows.filter((row) => kinds.includes(row.kind) && row.title.toLowerCase().includes(text));
}
