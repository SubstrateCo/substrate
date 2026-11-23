# Substrate

Substrate is an Electron workspace for email, messages, docs, tasks, agents, and CRM, with shared memory and linked, searchable records.

## Desktop-first product

- Design for the Electron desktop app. The web app is its renderer, not a standalone browser product.
- Automate shared renderer workflows against the real backend with headless Playwright in `apps/web/e2e`. Browser tests do not validate Electron bridges or native behavior.
- Validate native authentication, session isolation, desktop navigation, and permissions manually in the real Electron app.
- Keep non-UI logic in unit tests and request-only HTTP checks in server integration tests.

## Connected workspace

- Integrate features with existing workspace records and the shared identity, permission, and linking mechanisms.
- Keep structural relationships, contextual references, provenance, permissions, and notifications distinct.
- Model each relationship with exactly one mechanism: domain foreign keys for structure, `entity_links` for record-to-record context, and `message_entity_references` for message-to-record context. Load the `database-table-design` skill before you add or change a table, relationship, provenance, request, or history table.
- Preserve structured source references when creating work from existing context. Copied text is not enough.
- Provide forward navigation and backlinks where useful. Check access on each side.
- Keep cross-organization boundaries explicit. Users, actors, and contacts are distinct; matching identifiers do not establish identity or access.
- If a required connection is out of scope, report the gap and the decision needed. Do not build a disconnected substitute or unrelated features.

## Agent work

- Agents run on their owner's home desktop. The server keeps shared records and only what other devices need: wakes, requests, and agent status. The desktop keeps sessions, turns, transcripts, routines, and helpers in local SQLite. The native harness only executes turns.
- Admission decides every wake (`decideAdmission` in `packages/database/src/features/agent-work/wakes/admission.ts`). The owner wakes their agent: owner messages, owner answers and approvals, owner-approved routines, and the agent's own helpers. Other people wake it only as callers that the owner's caller policy admits: human members of the agent's organization, in channels and groups the owner can see. A call runs with the owner's access, and the owner approves it under `ask`. Agent-written messages never wake an agent.
- Agents publish only through `reply` and `propose`. Assistant text outside tools is the owner-only transcript. A turn with nothing useful to say ends quietly.
- Change agent-work statuses only through a machine event's compare-and-set (`packages/contracts/src/agent-work/machines/`): match the event's `from` states in the `WHERE` clause and write its `to` state. Add a new transition to the machine table first.
- Every agent-work trigger needs an entry in `packages/contracts/src/agent-work/triggers/registry.ts`. Local triggers enqueue only through `enqueue()` in client storage; callers do not choose a lane.
- The desktop host attaches a `TurnContext` to every MCP call. The model never supplies it, and the server checks it before using any field.
- Runtime rules for agents live in `packages/contracts/src/harness/policy.ts`. Bump `POLICY_VERSION` with every change to that text; the bump rotates every session's context.

## Code organization

- `apps/web` owns renderer presentation and application integration: routing, data loading, auth/session access, resource policies, mutations, cache updates, and Electron wiring.
- Keep presentation in `apps/web/src/components`, grouped by domain. Split large views into focused components and assemble them with composer components.
- Keep data fetching, authorization, and persistence separate from visual components where useful. Pass data, resolved capabilities, navigation targets, and callbacks to views.
- Do not add Storybook or a separate presentation package. Validate UI workflows through the Electron app.
- Group code by domain and responsibility. Avoid long, catch-all files.
- Keep database schemas in separate domain files, such as authentication, actors, entities, contacts, and CRM.
- Split repositories and tests by domain. Keep test files beside the code they test, with shared fixtures in a test-support module.
- Use index files for public exports, not implementation.

## Scripts

- Do not build any part of the app, including `bun run build`, unless the user explicitly asks for a build.

Run these commands from the repository root:

```sh
bun run lint       # Run type-aware linting and apply fixes.
bun run format     # Format files in place.
bun run typecheck  # Run Bun and workspace type checks.
bun run test       # Run workspace tests.
```
