import {
  sessionKeys,
  wakeDedupeKeys,
  type AgentSessionKind,
} from "@substrate/contracts/agent-work";

import type { NewInboxItem } from "./enqueue.ts";
import { localDedupeKeys } from "./inbox.ts";
import { AgentWorkStore } from "./store.ts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A store on a new SQLite file. Call cleanup when the test ends. */
export async function openTestStore() {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "agent-work-store-"));
  const path = join(root, "agent-work.sqlite");
  const store = await AgentWorkStore.open(path);
  return {
    store,
    path,
    async cleanup() {
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function createSession(
  store: AgentWorkStore,
  input: {
    organizationId?: string;
    userAgentId?: string;
    key?: string;
    kind?: AgentSessionKind;
    now?: number;
  } = {},
) {
  const kind = input.kind ?? "dm";
  const userAgentId = input.userAgentId ?? "agent-1";
  return store.sessions.ensure(
    {
      organizationId: input.organizationId ?? "org-1",
      userAgentId,
      agentId: userAgentId,
      key: input.key ?? sessionKeys[kind](crypto.randomUUID()),
      kind,
      harness: "claude",
      origin: kind === "dm" ? { conversationId: crypto.randomUUID(), threadId: null } : null,
    },
    input.now ?? 0,
  );
}

/** An item that is available at once, unlike debounced owner messages. */
export function item(
  session: { id: string; userAgentId: string },
  overrides: Partial<NewInboxItem> = {},
): NewInboxItem {
  const requestId = crypto.randomUUID();
  return {
    sessionId: session.id,
    userAgentId: session.userAgentId,
    source: "answer",
    sourceRef: { source: "answer", requestId, anchorMessageId: null, request: null },
    dedupeKey: wakeDedupeKeys.answer(requestId),
    ...overrides,
  };
}

export function ownerMessage(session: { id: string; userAgentId: string }) {
  const messageId = crypto.randomUUID();
  return item(session, {
    source: "owner_message",
    sourceRef: {
      source: "owner_message",
      messageId,
      conversationId: crypto.randomUUID(),
      threadId: null,
    },
    dedupeKey: wakeDedupeKeys.message(messageId),
  });
}

export function background(session: { id: string; userAgentId: string }) {
  const routineId = crypto.randomUUID();
  const scheduledAt = "2026-01-01T00:00:00Z";
  return item(session, {
    source: "routine",
    sourceRef: { source: "routine", routineId, revision: 1, scheduledAt },
    dedupeKey: localDedupeKeys.routine(routineId, 1, scheduledAt),
  });
}

export function system(session: { id: string; userAgentId: string }, dedupeKey: string) {
  return item(session, {
    source: "recovery",
    sourceRef: { source: "recovery", turnId: "previous-turn" },
    dedupeKey,
  });
}
