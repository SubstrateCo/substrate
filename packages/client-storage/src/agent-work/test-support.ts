import {
  sessionKeys,
  wakeDedupeKeys,
  type AgentSessionKind,
} from "@substrate/contracts/agent-work";

import { localDedupeKeys, type NewInboxItem } from "./inbox.ts";
import { AgentWorkStore } from "./store.ts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A store on a new SQLite file. Call cleanup when the test ends. */
export async function openTestStore() {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "agent-work-store-"));
  const store = await AgentWorkStore.open(join(root, "agent-work.sqlite"));
  return {
    store,
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
    lane: "owner",
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
    lane: "background",
    dedupeKey: localDedupeKeys.routine(routineId, 1, scheduledAt),
  });
}
