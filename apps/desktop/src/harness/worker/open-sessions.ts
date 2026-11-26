import type { HarnessCommand, HarnessEvent } from "@substrate/contracts/harness-runtime";

interface OpenSession {
  organizationId: string;
  turn?: { turnId: string; generation: number };
  /** The open command has not answered yet. */
  provisional: boolean;
}

/**
 * Main's view of the sessions open in the worker, so that a stopped worker still ends every
 * session and its live turn with session.closed { reason: "worker_exited" }.
 */
export function createOpenSessions() {
  const sessions = new Map<string, OpenSession>();
  return {
    /** An open was sent. It may open in the worker even if its answer never arrives. */
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
    /** The worker refused the open, so a session it did not have before is not open. */
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
    /** Synthetic session.closed events for every open session. Clears the view. */
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
