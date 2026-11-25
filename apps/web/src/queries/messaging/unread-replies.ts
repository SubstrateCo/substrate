function countByThread(threadIds: readonly string[]) {
  const counts = new Map<string, number>();
  for (const id of threadIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/**
 * Unread replies per thread root. Reading the timeline can move the read position past a reply, so
 * the replies unread on opening stay marked until their thread is opened. The open thread has no
 * mark.
 */
export function unreadRepliesByThread({
  opening,
  live,
  opened,
  openThreadId,
}: {
  /** One root ID per reply that was unread when the conversation opened. */
  opening: readonly string[];
  /** One root ID per reply that is unread now. */
  live: readonly string[];
  /** Threads opened since the conversation opened. */
  opened: readonly string[];
  openThreadId?: string;
}) {
  const counts = countByThread(live);
  for (const [id, count] of countByThread(opening))
    if (!opened.includes(id)) counts.set(id, Math.max(count, counts.get(id) ?? 0));
  if (openThreadId) counts.delete(openThreadId);
  return counts;
}
