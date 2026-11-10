type WorkLink = {
  entityId: string;
  purpose: string;
  canRemove: boolean;
};

/**
 * The work to list under a message. Mentions already show as chips in the body, so they are not
 * repeated. A record linked for several reasons shows once: it says "Created here" when the
 * message created it, and it can be unlinked when any of its links can.
 */
export function attachedWork<T extends WorkLink>(links: T[]) {
  const byEntity = new Map<string, T>();
  for (const link of links) {
    if (link.purpose === "mention") continue;
    const seen = byEntity.get(link.entityId);
    byEntity.set(
      link.entityId,
      seen
        ? {
            ...seen,
            purpose: seen.purpose === "source" ? seen.purpose : link.purpose,
            canRemove: seen.canRemove || link.canRemove,
          }
        : link,
    );
  }
  return [...byEntity.values()];
}
