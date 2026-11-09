# Client storage

- Each account has its own SQLite database. Never mix accounts in one file.
- Put each table group in its own file in `src/schema/`. Generate incremental Drizzle migrations into `migrations/`; do not rewrite them once created.
- Run every store operation in one transaction. Operations run one at a time, so a read-then-write sequence stays consistent.
- Split the agent-work store by responsibility in `src/agent-work/`. Scope every agent-work query to an organization.
- Keep invariants in the store, not in callers: one live turn per folder, gapless per-turn event sequences, and inbox dedupe keys.
