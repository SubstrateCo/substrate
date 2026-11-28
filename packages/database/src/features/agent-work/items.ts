import {
  inboxItemMachine,
  inboxSources,
  triggerRegistry,
  type InboxSource,
  type InboxSourceRef,
  type InboxStatus,
} from "@substrate/contracts/agent-work";
import { threadContextBatchLimit } from "@substrate/contracts/agent-work/control";

import type { DatabaseExecutor } from "../../core/executor";
import { inStates } from "./machine-sql";
import { agentColumns, type SessionRow } from "./sessions";
import { agentWorkItems } from "./work-items.schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

export type ItemRow = typeof agentWorkItems.$inferSelect;
export type ItemEvent = keyof typeof inboxItemMachine.events;

export const ownerMessageDebounceMs = 500;
export const ownerBatchWindowMs = 2000;

export const claimableStatuses: InboxStatus[] = ["pending", "confirmed_unconsumed"];
export const openStatuses: InboxStatus[] = [
  "pending",
  "submitted",
  "confirmed_unconsumed",
  "uncertain",
];
export const startingSources = inboxSources.filter(
  (source) => triggerRegistry[source].canStartTurn,
);
export const steerableSources = inboxSources.filter((source) => triggerRegistry[source].steerable);

const later = (now: Date, ms: number) => new Date(now.getTime() + ms);
const earliest = (...dates: Date[]) => new Date(Math.min(...dates.map((date) => date.getTime())));

export async function setItemStatus(
  db: DatabaseExecutor,
  ids: string[],
  event: ItemEvent,
  extra: Partial<Pick<ItemRow, "reason" | "held" | "turnId" | "steered">> = {},
) {
  if (!ids.length) return [];
  return db
    .update(agentWorkItems)
    .set({ status: inboxItemMachine.events[event].to, ...extra })
    .where(
      and(
        inArray(agentWorkItems.id, ids),
        inStates(agentWorkItems.status, inboxItemMachine.from(event)),
      ),
    )
    .returning({ id: agentWorkItems.id });
}

export interface NewWorkItem {
  session: SessionRow;
  source: InboxSource;
  sourceRef: InboxSourceRef;
  dedupeKey: string;
  body?: string | null;
}

async function mergeThreadContext(
  db: DatabaseExecutor,
  ref: Extract<InboxSourceRef, { source: "thread_context" }>,
  now: Date,
) {
  const pending = await db
    .select()
    .from(agentWorkItems)
    .where(
      and(
        eq(agentWorkItems.turnId, ref.targetTurnId),
        eq(agentWorkItems.source, "thread_context"),
        eq(agentWorkItems.status, "pending"),
      ),
    );
  const open = pending.find((row) => {
    const source = row.sourceRef;
    return (
      source.source === "thread_context" &&
      row.availableAt > now &&
      row.deadlineAt > now &&
      source.messageIds.length + ref.messageIds.length <= threadContextBatchLimit
    );
  });
  if (open?.sourceRef.source !== "thread_context") return undefined;
  const messageIds = [...new Set([...open.sourceRef.messageIds, ...ref.messageIds])];
  if (messageIds.length === open.sourceRef.messageIds.length) return open;
  const [updated] = await db
    .update(agentWorkItems)
    .set({
      sourceRef: { ...open.sourceRef, messageIds },
      availableAt: earliest(later(now, ownerMessageDebounceMs), open.deadlineAt),
    })
    .where(and(eq(agentWorkItems.id, open.id), eq(agentWorkItems.status, "pending")))
    .returning();
  return updated;
}

export async function enqueue(db: DatabaseExecutor, item: NewWorkItem, now: Date) {
  const ref = item.sourceRef;
  const passive = ref.source === "thread_context";
  if (passive) {
    const merged = await mergeThreadContext(db, ref, now);
    if (merged) return merged;
  }
  let availableAt = passive ? later(now, ownerMessageDebounceMs) : now;
  let deadlineAt = passive ? later(now, ownerBatchWindowMs) : now;
  const debounced = item.source === "owner_message";
  let open: ItemRow[] = [];
  if (debounced) {
    const batch = await db
      .select()
      .from(agentWorkItems)
      .where(
        and(
          eq(agentWorkItems.sessionId, item.session.id),
          eq(agentWorkItems.source, item.source),
          eq(agentWorkItems.status, "pending"),
          isNull(agentWorkItems.turnId),
        ),
      );
    open = batch.filter((row) => row.availableAt > now);
    deadlineAt = open.length
      ? earliest(...open.map((row) => row.deadlineAt))
      : later(now, ownerBatchWindowMs);
    availableAt = earliest(later(now, ownerMessageDebounceMs), deadlineAt);
  }
  const [row] = await db
    .insert(agentWorkItems)
    .values({
      ...agentColumns(item.session),
      sessionId: item.session.id,
      source: item.source,
      sourceRef: item.sourceRef,
      body: item.body ?? null,
      turnId: passive ? ref.targetTurnId : null,
      lane: triggerRegistry[item.source].lane,
      dedupeKey: item.dedupeKey,
      availableAt,
      deadlineAt,
      createdAt: now,
    })
    .onConflictDoNothing({ target: [agentWorkItems.userAgentId, agentWorkItems.dedupeKey] })
    .returning();
  if (row && open.length)
    await db
      .update(agentWorkItems)
      .set({ availableAt })
      .where(
        and(
          inArray(
            agentWorkItems.id,
            open.map((entry) => entry.id),
          ),
          eq(agentWorkItems.status, "pending"),
        ),
      );
  return row;
}
