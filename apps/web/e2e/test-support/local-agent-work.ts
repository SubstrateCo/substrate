import type { AgentSessionView, AgentTurnView } from "@substrate/contracts/agent-work";
import type {
  AgentConversationWork,
  AgentWorkChange,
} from "@substrate/contracts/agent-work/desktop";

import { isolateContext, type Client } from "./fixtures";

/** The browser has no native host. Keep its local bridge fixture isolated from pooled clients. */
export async function localAgentWork(
  client: Client,
  input: { agentId: string; conversationId: string; messageId: string; queued?: boolean },
) {
  isolateContext(client.page);
  const startedAt = new Date(Date.now() - 16_000).toISOString();
  const sessionId = crypto.randomUUID();
  const turn: AgentTurnView = {
    id: crypto.randomUUID(),
    sessionId,
    userAgentId: input.agentId,
    sessionKind: "dm",
    kind: "interactive",
    status: "running",
    outcome: null,
    attempt: 1,
    generation: 1,
    itemIds: [],
    outputs: [],
    sourceMessages: [
      {
        messageId: input.messageId,
        conversationId: input.conversationId,
        threadId: null,
        createdAt: startedAt,
      },
    ],
    requestAnchors: [],
    resumesTurnId: null,
    activity: null,
    error: null,
    attentionReason: null,
    usage: null,
    eventCount: 0,
    createdAt: startedAt,
    startedAt,
    finishedAt: null,
  };
  const session: AgentSessionView = {
    id: sessionId,
    userAgentId: input.agentId,
    key: `dm:${input.conversationId}`,
    kind: "dm",
    parentSessionId: null,
    origin: { conversationId: input.conversationId, threadId: null },
    destination: { conversationId: input.conversationId, threadId: null },
    harness: "opencode",
    epoch: 1,
    status: "working",
    createdAt: startedAt,
    updatedAt: startedAt,
  };
  const work: AgentConversationWork = {
    conversationId: input.conversationId,
    sessions: [session],
    turns: input.queued ? [] : [turn],
    items: [],
  };
  await client.page.addInitScript(
    (serialized: string) => {
      // SAFETY: this JSON contains only the typed fixture built above, not external input.
      const {
        work,
        turn: initialTurn,
        agentId,
      } = JSON.parse(serialized) as {
        work: AgentConversationWork;
        turn: AgentTurnView;
        agentId: string;
      };
      const turn = work.turns[0] ?? initialTurn;
      const listeners = new Set<(change: AgentWorkChange) => void>();
      const changed = () => {
        for (const listener of listeners)
          listener({
            userAgentId: agentId,
            conversationId: work.conversationId,
            turnId: turn.id,
          });
      };
      window.addEventListener("e2e:queue-agent-work", () => {
        const source = turn.sourceMessages[0]!;
        work.items = [
          {
            id: crypto.randomUUID(),
            sessionId: turn.sessionId,
            source: "owner_message",
            sourceRef: {
              source: "owner_message",
              messageId: source.messageId,
              conversationId: work.conversationId,
              threadId: null,
            },
            lane: "owner",
            status: "pending",
            held: false,
            reason: null,
            turnId: null,
            availableAt: turn.createdAt,
            createdAt: turn.createdAt,
          },
        ];
        changed();
      });
      window.addEventListener("e2e:finish-agent-work", (event) => {
        // SAFETY: only this spec dispatches the fixture's custom event, with a message ID.
        const messageId = (event as CustomEvent<string>).detail;
        turn.status = "completed";
        turn.outcome = "replied";
        turn.finishedAt = new Date().toISOString();
        turn.outputs = [
          {
            kind: "message",
            id: messageId,
            conversationId: work.conversationId,
            threadId: null,
            createdAt: turn.finishedAt,
          },
        ];
        changed();
      });
      Object.defineProperty(window, "substrateAgentWork", {
        value: {
          agents: async () => [
            {
              userAgentId: agentId,
              harness: "opencode",
              state: work.turns.length && turn.status === "running" ? "working" : "idle",
              liveTurnIds: work.turns.length && turn.status === "running" ? [turn.id] : [],
              queuedCount: work.items.length,
              needsAttentionTurnIds: [],
            },
          ],
          // Native IPC returns fresh structured clones, never the host's mutable storage objects.
          conversation: async () => structuredClone(work),
          turn: async () => structuredClone(turn),
          turnEvents: async () => [],
          onChange: (listener: (change: AgentWorkChange) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          stop: async () => {
            turn.status = "stopping";
            changed();
            await new Promise<void>((resolve) => {
              window.addEventListener(
                "e2e:finish-stop-agent-work",
                () => {
                  turn.status = "cancelled";
                  turn.finishedAt = new Date().toISOString();
                  changed();
                  resolve();
                },
                { once: true },
              );
            });
          },
        },
      });
    },
    JSON.stringify({ work, turn, agentId: input.agentId }),
  );
  return turn;
}
