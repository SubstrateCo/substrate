# Client storage

- Each account has its own SQLite database. Never mix accounts in one file.
- Put each table group in its own file in `src/schema/`. Generate incremental Drizzle migrations into `migrations/`; do not rewrite them once created.
- Run every store operation in one transaction. Operations run one at a time, so a read-then-write sequence stays consistent.
- The server is authoritative for agent control: work items, sessions, turns, routines and helpers. The agent-work store keeps only the host's execution data, keyed by server IDs: native sessions, turn attempts, transcripts, handoffs and MCP servers. Never add local copies of control data.
- Split the agent-work store by responsibility in `src/agent-work/`. Scope every agent-work query to an organization.
- Keep invariants in the store, not in callers: gapless per-turn event sequences across attempts, events only for attempts that ran here, and one epoch rotation at a time per session.
