import type { DatabaseExecutor } from "../../client";
import { realtimeOutbox } from "./schema";
import { asc, inArray } from "drizzle-orm";

export function readChanges(db: DatabaseExecutor, limit = 100) {
  return db
    .select()
    .from(realtimeOutbox)
    .orderBy(asc(realtimeOutbox.createdAt), asc(realtimeOutbox.id))
    .limit(limit);
}

export async function acknowledgeChanges(db: DatabaseExecutor, ids: string[]) {
  if (ids.length === 0) return;
  await db.delete(realtimeOutbox).where(inArray(realtimeOutbox.id, ids));
}
