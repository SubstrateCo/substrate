import {
  inboxSources,
  triggerRegistry,
  type InboxSource,
  type InboxSourceRef,
} from "@substrate/contracts/agent-work";

import { createSession, item, openTestStore } from "./test-support.ts";
import { expect, test } from "bun:test";

test("claims follow each trigger's turn mode, except helper sessions and rotation batches", async () => {
  const fixture = await openTestStore();
  const { store } = fixture;
  const refs: Record<InboxSource, InboxSourceRef> = {
    owner_message: { source: "owner_message", messageId: "m", conversationId: "c", threadId: null },
    answer: { source: "answer", requestId: "q", anchorMessageId: null, request: null },
    routine: {
      source: "routine",
      routineId: "r",
      revision: 1,
      scheduledAt: "2026-01-01T00:00:00Z",
    },
    helper_task: { source: "helper_task", helperId: "h" },
    helper_result: { source: "helper_result", helperId: "h" },
    recovery: { source: "recovery", turnId: "t" },
    epoch: { source: "epoch", fromEpoch: 0 },
    caller_message: {
      source: "caller_message",
      invocationId: "i",
      messageId: "m",
      conversationId: "c",
      threadId: null,
    },
    thread_context: {
      source: "thread_context",
      messageIds: ["m"],
      targetTurnId: "gone",
      conversationId: "c",
      threadId: "root",
    },
  };
  try {
    for (const source of inboxSources) {
      for (const kind of ["dm", "helper"] as const) {
        const session = await createSession(store, { kind, userAgentId: `${source}:${kind}` });
        await store.inbox.intake([item(session, { source, sourceRef: refs[source] })], 0);
        const [claimed] = await store.turns.claim(1000, { organizationId: "org-1" });
        if (!triggerRegistry[source].canStartTurn) {
          expect(claimed).toBeUndefined();
          continue;
        }
        expect(claimed!.turn.kind).toBe(
          kind === "helper" ? "unattended" : triggerRegistry[source].turnMode,
        );
        expect(claimed!.items[0]!.lane).toBe(triggerRegistry[source].lane);
        await store.turns.finish(claimed!.turn.id, { status: "completed" }, 1001);
      }
    }
    const session = await createSession(store);
    await store.sessions.opened(
      session.id,
      { nativeSessionId: "n", prefix: "p", policyVersion: 1 },
      0,
    );
    await store.inbox.intake([item(session)], 0);
    await store.epochs.requestRotation(session.id, "new_topic", "Hand off.", 1);
    const [rotation] = await store.turns.claim(1000, { organizationId: "org-1" });
    expect(rotation!.turn.kind).toBe("unattended");
    expect(rotation!.items.map((entry) => entry.source)).toEqual(["epoch"]);
    await store.turns.finish(rotation!.turn.id, { status: "completed" }, 1001);
    const [owner] = await store.turns.claim(1002, { organizationId: "org-1" });
    expect(owner!.turn.kind).toBe(triggerRegistry.answer.turnMode);
  } finally {
    await fixture.cleanup();
  }
});
