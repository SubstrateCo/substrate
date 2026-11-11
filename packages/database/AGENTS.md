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
- Every entity has an access container in `entities.access_entity_id`: a root is its own container, and a child uses its parent's. Grants are set on containers only. Create children with `createChildEntity`. Moving a child must update its container and structural references together; do not expose raw `access_entity_id` edits.
- Repositories take `RepositoryContext`, whitelist writable fields, check actor access, and participate in caller transactions.
- Derive actor scope from authenticated server context, not request-supplied identity fields.
- Organization owners and admins get owner access to their organization's shared record types through `readableCondition` and `entityAccessLevel`. Read the role on each query; do not store admin grants. People and personal mailbox or calendar records are excluded. In messaging, admins manage conversations but do not read private messages.
- Raw database access and actor provisioning are trusted server-only APIs. Do not expose them as agent tools.
- Keep integration tables feature-specific. Store connection and sync state together per mailbox or calendar; do not introduce generic integration or separate sync-state tables without a concrete need.
- Store credential references, not secrets, in feature integration records. Restrict management reads and writes to resource owners.
- Keep provider network calls outside database transactions. Commit imported records and their sync cursor together in one repository transaction, using the current sync lease.
- Cross-organization channels and messaging references require a dedicated sharing boundary that checks conversation and target-entity access. Never weaken organization-scoped grants, links, or foreign keys.

## Relationships and context

- Use domain foreign keys for structural relationships and shared entity links for contextual references. Do not duplicate structural relationships into entity links without a concrete query or lifecycle need.
- Represent source/provenance relationships explicitly when a workflow creates one record from another.
- Do not assume entity links contain every relationship. Cross-domain context queries must include relevant structural relationships and apply each domain's access rules.
- Save content and derived references atomically. Track derived and manual references separately so removing one does not remove the other.
- Validate organization, entity type, lifecycle state, and required access when establishing a relationship.
- Linking does not grant access or send notifications unless an explicit application policy requires it.
- Define relationship behavior for deletion, restoration, membership changes, and reparenting when implementing those operations.
- An entity-type enum value alone does not constitute an implemented domain. Do not create placeholder entities for unsupported feature types.

## Agent work

- Route wakes with `routeWake` inside the transaction that inserts the message. Wakes hold references, not message bodies; the home desktop reads bodies through the visibility-checked sources query.
- Answer requests with compare-and-set: the first answer wins.
- Execute a proposal exactly once. Bind it to its action hash and the target state recorded when it was proposed, and check both under the target's locks.
- Bind agent provenance with composite foreign keys: the actor must belong to the user agent and organization.
- Redact request and status views once the owner loses access to their conversation. Return `origin_turn_id` only to the agent's owner.

## Tests and migrations

- Test repositories and constraints against real PostgreSQL. `TEST_DATABASE_URL` must name a dedicated database ending in `_test`.
- Run `bun run test` from the repository root to use the package's Bun configuration and preload.
- Use the preload to migrate once and share one pool. Fixtures may reset and insert data, but must not recreate schemas, tables, or indexes.
- Run database tests serially. Concurrency tests may use multiple connections; parallel test files require separate databases.
- Cover invalid references, organization isolation, permission levels, safe links, and transaction rollback for each new domain.
- Generate incremental migrations. Do not rewrite migrations that have already been applied.
- Use Drizzle's PostgreSQL migrator. Do not implement a custom migration runner or migration-history table.
- PostgreSQL enum additions must be committed before later SQL uses them. Plan enum changes around Drizzle's migration transaction boundaries rather than adding custom migration execution logic.
- Do not add deployment workflows unless requested.
