# Database package

## Layout

- Put shared primitives in `src/core/<domain>/`: authentication, organizations, actors, entities, permissions, contacts, and links.
- Put feature code in `src/features/<feature>/`, such as email, calendar, messaging, tasks, CRM, and files.
- Each domain owns its table definitions, repositories, input contracts, and colocated tests. Split them into focused files as the domain grows.
- Core must not import feature implementations. Features may depend on core and on explicit references to other features.
- `src/schema/index.ts` is the schema export registry for Drizzle and applications. Keep repository composition outside individual domains.
- Keep shared test fixtures in `src/testing/`. Do not create a separate tree of test files.

## Shared primitives and feature composition

Arrows mean **“used by”**, not table ownership.

```mermaid
flowchart BT
    Foundation["Shared foundations<br/>Identity · Organizations · Entities<br/>Permissions · Links"]

    Messaging["Messaging"]
    Contacts["Contacts & interactions"]
    Files["Files & storage"]
    Tasks["Projects & tasks"]

    Chat["Chat"]
    Agents["Agent conversations"]
    CRM["CRM<br/>Accounts · Deals · Pipeline"]

    Foundation --> Messaging
    Foundation --> Contacts
    Foundation --> Files
    Foundation --> Tasks
    Foundation --> CRM

    Messaging --> Chat
    Messaging --> Agents
    Messaging -->|"Task discussions"| Tasks
    Messaging -->|"Source context"| CRM

    Contacts -->|"Contacts & timelines"| CRM
    Tasks -->|"Follow-ups"| CRM

    Files -->|"Attachments"| Messaging
    Files -->|"Attachments"| Tasks
```

## Persistence and access

- Entity-backed tables use `entity_id`; organization-owned records require `organization_id`.
- Enforce organization and entity-type alignment with composite foreign keys.
- Every entity has an access container in `entities.access_entity_id`: a root is its own container, and a child uses its parent's. Set grants on containers only. Create children with `createChildEntity`. Moving a child must update its container and structural references together; do not expose raw `access_entity_id` edits.
- Repositories take `RepositoryContext`, whitelist writable fields, check actor access, and participate in caller transactions.
- Design writes without explicit locks: no `FOR UPDATE`/`FOR SHARE` or advisory locks. Use guarded writes, compare-and-set on a version, and unique constraints; `SKIP LOCKED` is allowed only to claim queued work.
- Derive actor scope from authenticated server context, not request-supplied identity fields.
- Organization owners and admins get owner access to their organization's shared record types through `readableCondition` and `entityAccessLevel`. Read the role on each query; do not store admin grants. People and personal mailbox or calendar records are excluded. In messaging, admins manage conversations but do not read private messages.
- Raw database access and actor provisioning are trusted server-only APIs. Do not expose them as agent tools.
- Keep integration tables feature-specific. Store connection and sync state together per mailbox or calendar; do not add generic integration or separate sync-state tables without a concrete need.
- Store credential references, not secrets, in feature integration records. Restrict management reads and writes to resource owners.
- Keep provider network calls outside database transactions. Commit imported records and their sync cursor in one repository transaction, using the current sync lease.
- Cross-organization channels and messaging references require a dedicated sharing boundary that checks conversation and target-entity access. Never weaken organization-scoped grants, links, or foreign keys.

## Relationships and context

Load the `database-table-design` skill before you add or change a table, relationship, entity type, or relation type. It has the decision steps and table templates. These rules always apply:

- Every relationship uses exactly one of three mechanisms. Take the first one that fits:
  1. **Structure:** a domain foreign key or join table, when the relationship defines where a record belongs, who is responsible for it, or has its own fields.
  2. **Record context:** `entity_links`, when two entities are related but neither one belongs to the other.
  3. **Message context:** `message_entity_references`, when one end is a message. Messages are not entities.
- Do not add a table for provenance, retries, history, or derived references. Use the `source` message reference or a `related_to` link, `core/requests/once.ts`, the domain's activity table, and the content itself.
- Do not copy a structural relationship into `entity_links`.
- Writing a link needs edit access on the record being changed and view access on the other record. Linking does not grant access or send notifications. Readers see a link only when they can read both ends.
- An entity-type enum value is not an implemented domain. Do not create placeholder entities for unsupported feature types.

## Agent work

- The server owns agent control data: `agent_sessions`, `agent_work_items` (the queue), `agent_turns` (lifecycle, lease, summary), `agent_helpers` and `agent_routines`. Hosts keep native sessions, transcripts and handoffs. Status and turn outputs are derived on read; do not store them.
- Create every work item through `admit()` in `features/agent-work/admission/admission.ts`, and put every rule in the pure `decideAdmission`, including passive `thread_context` and host-submitted items. `routeMessage` is the entry point inside the transaction that inserts the message. Items hold references and server-owned text only, never message bodies; the host reads bodies through the visibility-checked sources query. The trigger registry alone chooses an item's lane.
- Change session, item, turn and helper statuses only through a machine event's compare-and-set. `SKIP LOCKED` is used only to claim queued items; the live-folder unique index arbitrates concurrent claims.
- A claim leases each turn to the claiming device. Host calls on a turn require the live turn, its attempt, and the lease of the calling device. Reach an agent's home only through `homeDeviceOf` and the homed-agent queries in `device.ts`.
- MCP calls load the server turn named by `TurnContext` (`features/mcp/turn.ts`). Origin, destination, session key, mode and handoff come from the turn and session rows, never from the caller.
- Routine and helper tools are server tools (`features/mcp/agent-work.ts`). Routine writes run only in interactive turns. A routine fires only while `approved_revision = revision`: the owner's save approves it, and an agent's create or revising change waits for the owner. The scheduler (`routines/scheduler.ts`) fires due routines through `admit()`. Helper tools are the agent's own work (`ownWork`): they never wait for approval. At most `maxLiveHelpers` run per agent, helpers cannot start helpers, and only a helper turn can call `finish_helper`.
- Owner commands (`owner/commands.ts`) change turns, items and sessions with the same machine events as the host, and hint the owner's audience, which also reaches the home host. Retry and start-fresh lease the turn to the agent's home device. Start-fresh and new-topic grow `agent_sessions.reset_generation`; steered input never joins a turn from an older generation.
- Owner views (`owner/views.ts`) hide the place, key, references, activity, errors and helper text of work whose conversation the owner cannot open now. Turn outputs are derived from `messaging_messages.origin_turn_id`, `agent_requests.turn_id` and task receipts in `agent_tool_requests`.
- Disabling an agent ends its live turns; deleting it also drops its queue and stops its helpers and routines (`stop.ts`).
- Answer requests with compare-and-set: the first answer wins.
- Execute a proposal exactly once. Bind it to its action hash and the target state recorded when it was proposed, and check both in the transaction that runs the action.
- Bind agent provenance with composite foreign keys: the actor must belong to the user agent and organization.
- Redact request and status views once the owner loses access to their conversation. Return `origin_turn_id` only to the agent's owner.

## Tests and migrations

- Test repositories and constraints against real PostgreSQL. `TEST_DATABASE_URL` must name a dedicated database ending in `_test`.
- Run `bun run test` from the repository root to use the package's Bun configuration and preload.
- The preload migrates once and shares one pool. Fixtures may reset and insert data, but must not recreate schemas, tables, or indexes.
- Run database tests serially. Concurrency tests may use multiple connections; parallel test files require separate databases.
- Cover invalid references, organization isolation, permission levels, safe links, and transaction rollback for each new domain.
- Generate incremental migrations. Do not rewrite applied migrations.
- Use Drizzle's PostgreSQL migrator. Do not write a custom migration runner, migration-history table, or migration execution logic.
- Commit PostgreSQL enum additions before later SQL uses them. Plan enum changes around Drizzle's migration transaction boundaries.
- Do not add deployment workflows unless requested.
