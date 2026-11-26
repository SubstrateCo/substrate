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

- The server owns agent control: sessions, work items (the queue), turns and their leases, routines, helpers, requests, and agent status, which it derives on read. The owner's home desktop is the agent host (`packages/agent-host`, wired into Electron by `apps/desktop`): it claims leased turns over `/api/v1/agent-work/host/*`, runs them in native harness sessions, and reports progress and ends. The host keeps only native sessions, turn runs, transcripts, handoffs, skills, and MCP servers locally. The host never decides what work exists. Other devices read and command agent work over HTTP.
- Admission decides every work item, including host-submitted ones (`decideAdmission` in `packages/database/src/features/agent-work/admission/admission.ts`). Only the owner wakes their agent: owner messages, owner answers and approvals, owner-approved routines, and the agent's own helpers. Other people's thread messages become passive context that never starts a turn, and agent-written messages never wake an agent.
- Agents publish only through `reply` and `propose`. Assistant text outside tools is the owner-only transcript. A turn with nothing useful to say ends quietly.
- Change agent-work statuses only through a machine event's compare-and-set (`packages/contracts/src/agent-work/machines/`): match the event's `from` states in the `WHERE` clause and write its `to` state. Add a new transition to the machine table first.
- Every agent-work trigger needs an entry in `packages/contracts/src/agent-work/triggers/registry.ts`. The registry alone chooses an item's lane; callers never choose one.
- The host attaches a `TurnContext` (`{ turnId, attempt }`) to every MCP call. The model never supplies it. The server loads the turn and uses it only while it is live, in that attempt, and leased by the caller's device, which is the agent's home; everything else comes from the server's turn and session rows.
- Runtime rules for agents live in `packages/contracts/src/agent-tools/policy.ts`. Bump `POLICY_VERSION` with every change to that text; the bump rotates every session's context.

## Code organization

- `apps/web` owns renderer presentation and application integration: routing, data loading, auth/session access, resource policies, mutations, cache updates, and Electron wiring.
- Keep presentation in `apps/web/src/components`, grouped by domain. Split large views into focused components and assemble them with composer components.
- Keep data fetching, authorization, and persistence separate from visual components where useful. Pass data, resolved capabilities, navigation targets, and callbacks to views.
- Do not add Storybook or a separate presentation package. Validate UI workflows through the Electron app.
- Keep prototypes local and untracked. Production code and tests must not import them.
- Do not commit plan, design-note, or prototype files. Remove them from a PR before it merges.
- Push fixes to an open PR as new commits. Preserve published commits and review progress; do not squash or rewrite their history.
- Group code by domain and responsibility. Avoid long, catch-all files.
- Keep database schemas in separate domain files, such as authentication, actors, entities, contacts, and CRM.
- Split repositories and tests by domain. Keep test files beside the code they test, with shared fixtures in a test-support module.
- Use index files for public exports, not implementation.

## Scripts

- Do not build any part of the app, including `bun run build`, unless the user explicitly asks for a build.
- Always run scripts from the root `package.json` so their results are cached. Do not run tools with `bunx` or from inside a package unless no root script covers the task.

Run these commands from the repository root:

```sh
bun run lint       # Run type-aware linting and apply fixes.
bun run format     # Format files in place.
bun run typecheck  # Run Bun and workspace type checks.
bun run test       # Run workspace tests.
```
