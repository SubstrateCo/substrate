import type { HarnessCommand, HarnessEvent } from "@substrate/contracts/harness-runtime";

interface OpenSession {
  organizationId: string;
  turn?: { turnId: string; generation: number };
  provisional: boolean;
}

export function createOpenSessions() {
  const sessions = new Map<string, OpenSession>();
  return {
    opening(command: Extract<HarnessCommand, { type: "open" }>) {
      if (!sessions.has(command.sessionId))
        sessions.set(command.sessionId, {
          organizationId: command.organizationId,
          provisional: true,
        });
    },
    opened(sessionId: string) {
      const session = sessions.get(sessionId);
      if (session) session.provisional = false;
    },
    openFailed(sessionId: string) {
      if (sessions.get(sessionId)?.provisional) sessions.delete(sessionId);
    },
    observe(event: HarnessEvent) {
      const session = sessions.get(event.sessionId);
      if (event.type === "session.closed") sessions.delete(event.sessionId);
      else if (!session) return;
      else if (event.type === "turn.started" && event.turnId !== null)
        session.turn = { turnId: event.turnId, generation: event.generation ?? 0 };
      else if (event.type === "turn.completed" && session.turn?.turnId === event.turnId)
        session.turn = undefined;
    },
    exited(): HarnessEvent[] {
      const events = [...sessions].map(([sessionId, session]): HarnessEvent => ({
        type: "session.closed",
        reason: "worker_exited",
        sessionId,
        organizationId: session.organizationId,
        turnId: session.turn?.turnId ?? null,
        generation: session.turn?.generation ?? null,
        timestamp: Date.now(),
      }));
      sessions.clear();
      return events;
    },
  };
}
