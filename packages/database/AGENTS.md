# Database package

## Layout

- Put shared primitives in `src/core/<domain>/`: authentication, organizations, actors, entities, permissions, contacts, and links.
- Put feature code in `src/features/<feature>/`, such as email, calendar, messaging, tasks, CRM, and files.
- Each domain owns its table definitions, repositories, input contracts, and colocated tests. Split these into focused files as the domain grows.
- Shared primitives must not import feature implementations. Features may depend on core primitives and explicit references to other features.
- Keep `src/schema/index.ts` as the schema export registry for Drizzle and applications. Keep repository composition outside individual domains.
- Keep shared database test fixtures in `src/testing/`. Do not create a separate tree of test files.

## Persistence and access

- Entity-backed tables use `entity_id`; organization-owned records require `organization_id`.
- Enforce organization and entity-type alignment with composite foreign keys.
- Establish access inheritance when creating a new child entity. Reparenting requires explicit cycle checks and updates to the feature's structural references; do not expose raw parent-table edits.
- Repositories take `RepositoryContext`, whitelist writable fields, check actor access, and participate in caller transactions.
- Derive actor scope from authenticated server context, not request-supplied identity fields.
- Raw database access and actor provisioning are trusted server-only APIs. Do not expose them as agent tools.
- Keep integration tables feature-specific. Store connection and sync state together per mailbox or calendar; do not introduce generic integration or separate sync-state tables without a concrete need.
- Store credential references, not secrets, in feature integration records. Restrict management reads and writes to resource owners.
- Keep provider network calls outside database transactions. Commit imported records and their sync cursor together in one repository transaction, using the current sync lease.
- Cross-organization channels require a dedicated sharing boundary. Never relax ordinary organization-scoped grants, links, or foreign keys to implement shared channels.

## Tests and migrations

- Test repositories and constraints against real PostgreSQL with `TEST_DATABASE_URL` pointing to a dedicated database whose name ends in `_test`.
- Use Bun's test preload to migrate once and share one connection pool for the entire run. Per-test fixtures reset and insert data only; do not recreate schemas, tables, or indexes.
- Run workspace tests with `bun run test` from the repository root so the package's Bun test configuration and preload are used.
- Keep database tests serial because they share a database. Concurrency tests may use multiple connections within one test. Parallel test files require separate databases.
- Cover invalid references, organization isolation, permission levels, safe links, and transaction rollback for each new domain.
- Generate incremental migrations. Do not rewrite migrations that have already been applied.
- Use Drizzle's PostgreSQL migrator. Do not implement a custom migration runner or migration-history table.
- PostgreSQL enum additions must be committed before later SQL uses them. Plan enum changes around Drizzle's migration transaction boundaries rather than adding custom migration execution logic.
- Do not add deployment workflows unless requested.
