import {
  ownerBatchWindowMs,
  ownerMessageDebounceMs,
  type InboxRow,
} from "@substrate/client-storage/agent-work";

import type { RuntimeContext } from "./context.ts";
import { pullWakes } from "./intake.ts";
import type { TurnExecutor } from "./turn-executor.ts";
import { createHash } from "node:crypto";

const batchLimit = 20;
const batchBudget = 20;
const passiveWindowMs = 10 * 60_000;

function messageIds(item: InboxRow) {
  const ref = item.sourceRef;
  if (ref.source === "thread_context") return ref.messageIds;
  return "messageId" in ref ? [ref.messageId] : [];
}

/** Thread traffic is local, turn-bound context, never a server wake or a new task. */
export function createThreadContext(context: RuntimeContext, executor: TurnExecutor) {
  let syncing: Promise<void> | undefined;
  const exhausted = new Set<string>();
  async function sync() {
    for (const id of exhausted) if (!executor.live.has(id)) exhausted.delete(id);
    for (const state of executor.live.values()) {
      if (!state.threadId || !state.conversationId) continue;
      const activeDiscussion =
        state.kind === "interactive" && !state.handoff && state.capabilities.steer;
      if (!activeDiscussion) continue;
      const agent = await context.agents.get(state.userAgentId);
      if (!agent?.home || !agent.threadContextEnabled) continue;
      const turn = await context.store.turns.get(state.turnId);
      if (!turn || turn.status !== "running") continue;
      const items = await context.store.inbox.forTurn(context.organizationId, state.turnId);
      const batches = items.filter((item) => item.source === "thread_context");
      if (batches.length >= batchBudget || context.now() - state.startedAt >= passiveWindowMs) {
        if (!exhausted.has(state.turnId)) {
          await context.store.events.append(
            state.turnId,
            [
              {
                kind: "note",
                data: {
                  text: "Stopped passive thread updates: the 20-batch or 10-minute limit was reached.",
                },
              },
            ],
            context.now(),
          );
          exhausted.add(state.turnId);
        }
        continue;
      }
      const seen = new Set([
        ...items.flatMap(messageIds),
        ...turn.sourceMessages.map((message) => message.messageId),
      ]);
      const anchors = turn.sourceMessages;
      const latest = [...anchors]
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || b.messageId.localeCompare(a.messageId),
        )
        .at(0);
      const since = latest?.createdAt ?? new Date(state.startedAt).toISOString();
      const collected = [];
      let before: string | undefined;
      // Pages are oldest-first; walk backwards until the turn's source boundary is covered.
      for (;;) {
        const page = await context.server.threadMessages(
          context.organizationId,
          state.conversationId,
          state.threadId,
          before,
        );
        collected.unshift(...page);
        const first = page.at(0);
        if (!first) break;
        if (page.length < 50 || first.createdAt < since || first.id === before) break;
        before = first.id;
      }
      // A message and its wake commit together. Pull again after reading messages so an explicit
      // call committed during the read cannot also be delivered as passive context.
      const activated = await pullWakes(context);
      if (activated) {
        context.changed({});
        context.later(() => context.changed({}), ownerMessageDebounceMs + 10);
        context.later(() => context.changed({}), ownerBatchWindowMs + 10);
      }
      const current = await context.store.inbox.forTurn(context.organizationId, state.turnId);
      const open = await context.store.inbox.openForSessions([state.sessionId]);
      for (const id of [...current, ...open].flatMap(messageIds)) seen.add(id);
      const fresh = collected.filter(
        (message) =>
          message.createdAt >= since &&
          !seen.has(message.id) &&
          message.originTurnId !== state.turnId &&
          message.body,
      );
      for (
        let offset = 0;
        offset < fresh.length && batches.length + offset / batchLimit < batchBudget;
        offset += batchLimit
      ) {
        const ids = fresh.slice(offset, offset + batchLimit).map((message) => message.id);
        const hash = createHash("sha256").update(ids.join(":")).digest("hex");
        await context.store.inbox.intake(
          [
            {
              sessionId: state.sessionId,
              userAgentId: state.userAgentId,
              source: "thread_context",
              sourceRef: {
                source: "thread_context",
                messageIds: ids,
                targetTurnId: state.turnId,
                conversationId: state.conversationId,
                threadId: state.threadId,
              },
              dedupeKey: `thread-context:${state.turnId}:${hash}`,
              availableAt: context.now() + 500,
            },
          ],
          context.now(),
        );
        context.later(
          () => context.changed({ userAgentId: state.userAgentId, turnId: state.turnId }),
          510,
        );
      }
    }
  }
  return {
    sync() {
      syncing ??= sync().finally(() => {
        syncing = undefined;
      });
      return syncing;
    },
  };
}
