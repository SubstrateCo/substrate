import {
  triggerRegistry,
  type InboxSource,
  type InboxSourceRef,
} from "@substrate/contracts/agent-work";

import type { LocalTransaction } from "../database.ts";
import { inbox, sessions } from "../schema/index.ts";
import { and, eq, inArray, isNull } from "drizzle-orm";

/** An owner message waits this long for more messages before its turn can start. */
export const ownerMessageDebounceMs = 500;
/** A batch of owner messages closes this long after its first message. */
export const ownerBatchWindowMs = 2000;

export interface NewInboxItem {
  sessionId: string;
  userAgentId: string;
  source: InboxSource;
  sourceRef: InboxSourceRef;
  dedupeKey: string;
  body?: string | null;
  wakeId?: string | null;
  /** Defaults to now. Owner messages are debounced instead. */
  availableAt?: number;
}

/**
 * Inserts an item unless the agent already has one with its dedupe key. The item takes its
 * session's organization. Owner messages wait for more messages: each new one moves the batch
 * 500 ms out, up to 2 s after the first.
 */
export async function enqueue(tx: LocalTransaction, item: NewInboxItem, now: number) {
  const session = await tx
    .select({ organizationId: sessions.organizationId })
    .from(sessions)
    .where(eq(sessions.id, item.sessionId))
    .get();
  if (!session) throw new Error("Session not found.");
  let availableAt = item.availableAt ?? now;
  let deadlineAt = availableAt;
  const debounced = item.source === "owner_message";
  let batch: (typeof inbox.$inferSelect)[] = [];
  if (debounced) {
    batch = await tx
      .select()
      .from(inbox)
      .where(
        and(
          eq(inbox.sessionId, item.sessionId),
          eq(inbox.source, "owner_message"),
          eq(inbox.status, "pending"),
          isNull(inbox.turnId),
        ),
      )
      .all();
    const open = batch.filter((row) => row.availableAt > now);
    deadlineAt = open.length
      ? Math.min(...open.map((row) => row.deadlineAt))
      : now + ownerBatchWindowMs;
    availableAt = Math.min(now + ownerMessageDebounceMs, deadlineAt);
  }
  const inserted = await tx
    .insert(inbox)
    .values({
      id: crypto.randomUUID(),
      organizationId: session.organizationId,
      sessionId: item.sessionId,
      userAgentId: item.userAgentId,
      source: item.source,
      sourceRef: item.sourceRef,
      body: item.body ?? null,
      wakeId: item.wakeId ?? null,
      lane: triggerRegistry[item.source].lane,
      dedupeKey: item.dedupeKey,
      availableAt,
      deadlineAt,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  const row = inserted.at(0);
  if (row && debounced) {
    const open = batch.filter((entry) => entry.availableAt > now).map((entry) => entry.id);
    if (open.length) await tx.update(inbox).set({ availableAt }).where(inArray(inbox.id, open));
  }
  return row;
}
