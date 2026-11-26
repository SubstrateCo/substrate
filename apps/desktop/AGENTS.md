# Desktop application

## Agent work

- The agent host loop lives in `@substrate/agent-host` (`packages/agent-host`); follow its `AGENTS.md`. `src/agents/` keeps only the Electron wiring: the service that opens one runtime per verified account and organization, the installation ID, and the `substrateAgentWork` bridge. Main implements the host's ports: the harness controller is its `HarnessPort`, and the mail service supplies the private inbox.
- Only Electron main drives the harness, through the harness controller. The renderer reaches local agent data only through the `substrateAgentWork` bridge: transcripts, turn attempts and the agents homed here. Commands, routines and turn summaries are server HTTP. Main validates bridge input and derives the account and organization itself.
