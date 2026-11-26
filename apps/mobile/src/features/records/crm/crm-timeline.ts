export const timelinePageSize = 50;

export function timelineCursor(rows: readonly { entityId: string; occurredAt: string }[]) {
  const last = rows.at(-1);
  return rows.length === timelinePageSize && last
    ? { beforeOccurredAt: last.occurredAt, beforeEntityId: last.entityId }
    : undefined;
}
