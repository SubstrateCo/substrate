# Desktop application

## Agent work

- The agent-work runtime lives in `src/agents/`. Local SQLite (`@startup-os/client-storage/agent-work`) is its source of truth. Write harness events to the local store before acting on them.
- Only Electron main drives the harness, through the harness controller. The renderer reaches agent work only through the `startupOSAgentWork` bridge. Main validates bridge input and derives the account and organization itself.
- Run turns only for agents homed on this device. When an agent moves away, stop its routines and close its live work.
- Classify harness and server failures:
  - Outages and transient codes requeue the work with backoff. Work waits while the network or worker is down.
  - Definitive failures, such as `resume-failed`, move the turn to needs attention.
  - A steer that fails with an unknown or transient error marks the item uncertain. Revert it to pending only when the error proves the input was not delivered.
- Record why the runtime stops or closes a turn before it closes the native session. The close then finishes the turn as cancelled or interrupted, not as needs attention.
- Test the runtime with the host-faithful fake harness in `src/agents/runtime/test-support.ts`. Keep its behavior aligned with the real host and controller.
