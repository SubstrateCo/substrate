export function narrowedSuggestions<T extends { kind: string; title: string }>(
  rows: readonly T[] | undefined,
  kinds: readonly string[],
  query: string,
): T[] | undefined {
  if (!rows) return undefined;
  const text = query.trim().toLowerCase();
  return rows.filter((row) => kinds.includes(row.kind) && row.title.toLowerCase().includes(text));
}
