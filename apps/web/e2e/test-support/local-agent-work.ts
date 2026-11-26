import type { TurnEventView } from "@substrate/contracts/agent-work";
import type { AgentHomedHere, AgentWorkChange } from "@substrate/contracts/agent-work/desktop";

import { isolateContext, type Client } from "./fixtures";

/**
 * The home desktop's local transcripts, for a browser that has no native host. Server work comes
 * from the real backend; this bridge only says the agent is homed here and serves the turn's
 * transcript. Keep its context isolated from pooled clients.
 */
export async function localAgentWork(
  client: Client,
  input: { agentId: string; turnId: string; text: string },
) {
  isolateContext(client.page);
  const homed: AgentHomedHere[] = [{ userAgentId: input.agentId, liveTurnIds: [input.turnId] }];
  const events: TurnEventView[] = [
    {
      turnId: input.turnId,
      seq: 1,
      attempt: 1,
      kind: "text",
      itemId: null,
      data: { text: input.text },
      createdAt: new Date().toISOString(),
    },
  ];
  await client.page.addInitScript((serialized: string) => {
    // SAFETY: this JSON contains only the typed fixture built above, not external input.
    const { homed, events } = JSON.parse(serialized) as {
      homed: AgentHomedHere[];
      events: TurnEventView[];
    };
    const listeners = new Set<(change: AgentWorkChange) => void>();
    Object.defineProperty(window, "substrateAgentWork", {
      value: {
        // Native IPC returns fresh structured clones, never the host's mutable storage objects.
        homedAgents: async () => structuredClone(homed),
        turnRuns: async () => [],
        turnEvents: async (turnId: string, after = 0) =>
          structuredClone(events.filter((event) => event.turnId === turnId && event.seq > after)),
        onChange: (listener: (change: AgentWorkChange) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    });
  }, JSON.stringify({ homed, events }));
}
