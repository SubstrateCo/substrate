# Agent host

- This package is the agent host loop. The server is authoritative for agent control: the work queue, sessions, turns, routines and helpers. The host claims turns through the host API (`/agent-work/host/*`), runs them in native harness sessions, and reports their progress and end. It never decides what work exists.
- Keep it portable. Do not import Electron or `apps/desktop`. A host process (the desktop today, a cloud sandbox later) implements the ports in `src/ports.ts` and passes them to `createAgentWorkRuntime`.
- The local store (`@substrate/client-storage/agent-work`) keeps only execution data: native sessions and epochs, turn attempts, transcripts, handoffs and MCP servers. Write harness events to the local transcript before acting on them.
- The host cycle runs on realtime agent-work hints and every 30 s: report held-back turn ends, `sync` this device's live turns (stops, moves, continued and retried turns, recovery after a restart), `claim` into free slots, then `steer` waiting items into live turns. The heartbeat (every 60 s) keeps the device online and renews its leases.
- Run turns only for agents homed on this device. When an agent moves away, the server ends its leases; the next sync stops its work here without a report.
- A turn whose harness process died is reported with `recover` and the local evidence (an unfinished tool call of the attempt). The server decides whether it continues as its next attempt.
- Apply each session's reset generation before a turn runs: a higher generation opens a fresh native session in a new epoch. Context thresholds stay local: a full context submits an `epoch` item, and the epoch rotates after its handoff turn.
- Classify harness and server failures:
  - Outages and transient codes call `retry-later` with backoff. Work waits while the network or worker is down. A turn end that the server cannot take is sent again.
  - Definitive failures, such as `resume-failed`, finish the turn as needs attention.
  - A steer that fails with an unknown or transient error is reported uncertain. Report it undelivered only when the error proves the input was not delivered.
- Record why the runtime stops or closes a turn before it closes the native session. The close then finishes the turn as cancelled or interrupted, not as needs attention.
- Test the runtime with the fixture in `src/runtime/test-support.ts` (exported as `@substrate/agent-host/testing`). It runs the real harness host from `@substrate/harness-runtime` with a fake control plane, a fake native adapter and a manual clock. Its thin controller wrapper checks the organization and reports host failures by code, and its worker view closes open sessions when the worker exits; keep both aligned with the desktop's harness controller and process. Keep the fake control plane aligned with the server's host rules.
