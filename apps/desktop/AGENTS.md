# Desktop application

## Agent work

- The agent-work runtime lives in `src/agents/`. Local SQLite (`@substrate/client-storage/agent-work`) is its source of truth. Write harness events to the local store before acting on them.
- Only Electron main drives the harness, through the harness controller. The renderer reaches agent work only through the `substrateAgentWork` bridge. Main validates bridge input and derives the account and organization itself.
- Run turns only for agents homed on this device. When an agent moves away, stop its routines and close its live work.
- Declare `caller_wakes` when pulling wakes. Recheck caller invocations before delivery and attach their IDs to the turn's MCP context, including steered calls. Hold new calls for the next turn when its 20-call context is full.
- Classify harness and server failures:
  - Outages and transient codes requeue the work with backoff. Work waits while the network or worker is down.
  - Definitive failures, such as `resume-failed`, move the turn to needs attention.
  - A steer that fails with an unknown or transient error marks the item uncertain. Revert it to pending only when the error proves the input was not delivered.
- Record why the runtime stops or closes a turn before it closes the native session. The close then finishes the turn as cancelled or interrupted, not as needs attention.
- Test the runtime with the fixture in `src/agents/runtime/test-support.ts`. It runs the real harness host from `@substrate/harness-runtime` with a fake native adapter and a manual clock. Its thin controller wrapper checks the organization and reports host failures by code; keep it aligned with the real controller.
