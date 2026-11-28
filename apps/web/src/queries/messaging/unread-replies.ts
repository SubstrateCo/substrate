function countByThread(threadIds: readonly string[]) {
  const counts = new Map<string, number>();
  for (const id of threadIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

export function unreadRepliesByThread({
  opening,
  live,
  opened,
  openThreadId,
}: {
  opening: readonly string[];
  live: readonly string[];
  opened: readonly string[];
  openThreadId?: string;
}) {
  const counts = countByThread(live);
  for (const [id, count] of countByThread(opening))
    if (!opened.includes(id)) counts.set(id, Math.max(count, counts.get(id) ?? 0));
  if (openThreadId) counts.delete(openThreadId);
  return counts;
}
