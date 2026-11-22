import {
  triggerRegistry,
  type InboxSource,
  type InboxSourceRef,
} from "@substrate/contracts/agent-work";

import type { LocalTransaction } from "../database.ts";
import { inbox, sessions, turns } from "../schema/index.ts";
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
  const ref = item.sourceRef;
  if (ref.source === "thread_context") {
    const turn = await tx
      .select()
      .from(turns)
      .where(and(eq(turns.id, ref.targetTurnId), eq(turns.organizationId, session.organizationId)))
      .get();
    if (!turn) return undefined;
    const sameSession =
      turn.organizationId === session.organizationId && turn.sessionId === item.sessionId;
    if (!sameSession || !["assigned", "running", "waiting"].includes(turn.status)) return undefined;
    const pending = await tx
      .select()
      .from(inbox)
      .where(
        and(
          eq(inbox.turnId, ref.targetTurnId),
          eq(inbox.organizationId, session.organizationId),
          eq(inbox.source, "thread_context"),
          eq(inbox.status, "pending"),
        ),
      )
      .all();
    const open = pending.find((row) => {
      const source = row.sourceRef;
      return (
        source.source === "thread_context" &&
        row.availableAt > now &&
        row.deadlineAt > now &&
        source.messageIds.length + ref.messageIds.length <= 20
      );
    });
    if (open && open.sourceRef.source === "thread_context") {
      const messageIds = [...new Set([...open.sourceRef.messageIds, ...ref.messageIds])];
      if (messageIds.length === open.sourceRef.messageIds.length) return undefined;
      const [updated] = await tx
        .update(inbox)
        .set({
          sourceRef: { ...open.sourceRef, messageIds },
          availableAt: Math.min(now + ownerMessageDebounceMs, open.deadlineAt),
        })
        .where(and(eq(inbox.id, open.id), eq(inbox.status, "pending")))
        .returning();
      return updated;
    }
  }
  let availableAt = item.availableAt ?? now;
  let deadlineAt = ref.source === "thread_context" ? now + ownerBatchWindowMs : availableAt;
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
      turnId: ref.source === "thread_context" ? ref.targetTurnId : null,
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
