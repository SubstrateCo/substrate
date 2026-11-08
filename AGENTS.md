# Startup OS

Startup OS is an Electron workspace for email, messages, docs, tasks, agents, and CRM, with shared memory and linked, searchable records.

## Desktop-first product

- Design for the Electron desktop app. The web app is its renderer, not a standalone browser product.
- Validate application UI workflows manually through the real Electron app, including native authentication, session isolation, navigation, and permissions.
- Keep non-UI logic in unit tests and request-only HTTP checks in server integration tests. There is no automated end-to-end suite.

## Connected workspace

- Integrate features with existing workspace records and shared identity, permission, and linking mechanisms.
- Keep structural relationships, contextual references, provenance, permissions, and notifications distinct.
- Preserve structured source references when creating work from existing context; copied text alone is not enough.
- Provide forward navigation and backlinks where useful, checking access on each side.
- Keep cross-organization boundaries explicit. Users, actors, and contacts are distinct; matching identifiers do not establish identity or access.
- If a required connection is out of scope, report the gap and decision needed. Do not build a disconnected substitute or unrelated features.

## Code organization

- `apps/web` owns renderer presentation and application integration, including routing, data loading, auth/session access, resource policies, mutations, cache updates, and Electron wiring.
- Keep presentation in `apps/web/src/components`, grouped by domain. Split large views into focused components with meaningful responsibilities and assemble them with composer components.
- Keep data fetching, authorization, and persistence separate from visual components where useful. Pass data, resolved capabilities, navigation targets, and callbacks to views.
- Do not add Storybook or a separate presentation package boundary. Validate UI workflows through the Electron app.
- Group code by domain and responsibility. Keep files focused and avoid long, catch-all files.
- Keep database schemas in separate domain files, such as authentication, actors, entities, contacts, and CRM. Do not combine all table definitions in one file.
- Split repositories and tests by domain as needed. Keep test files beside the code they test, with shared fixtures in a test-support module.
- Use index files for public exports, not implementation.

## Scripts

- Do not run `bun run build` or build any part of the app for regular validation. Run build commands only when the user explicitly asks for a build.

Run these commands from the repository root:

```sh
bun run lint       # Run type-aware linting and apply fixes.
bun run format     # Format files in place.
bun run typecheck  # Run Bun and workspace type checks.
bun run test       # Run workspace tests.
```
