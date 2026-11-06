# Startup OS

Startup OS is an Electron workspace for email, messages, docs, tasks, agents, and CRM, with shared memory and linked, searchable records.

## Desktop-first product

- Design for the Electron desktop app. The web app is its renderer, not a standalone browser product.
- Run application UI, integration, and end-to-end workflows through the real Electron app. Browser-only Playwright runs do not establish desktop workflow coverage.
- Share workflow tests through desktop fixtures that preserve native authentication, session isolation, navigation, and permissions. Keep unit tests for non-UI logic; isolated component tests do not replace desktop workflow tests.

## Connected workspace

- Integrate features with existing workspace records and shared identity, permission, and linking mechanisms.
- Keep structural relationships, contextual references, provenance, permissions, and notifications distinct.
- Preserve structured source references when creating work from existing context; copied text alone is not enough.
- Provide forward navigation and backlinks where useful, checking access on each side.
- Keep cross-organization boundaries explicit. Users, actors, and contacts are distinct; matching identifiers do not establish identity or access.
- If a required connection is out of scope, report the gap and decision needed. Do not build a disconnected substitute or unrelated features.

## Code organization

- `packages/ui` is the only owner of presentation for the renderer. This includes domain-specific and single-use views, layout markup, styles, forms, rows, tiles, and feedback states.
- `apps/web` owns application integration only: routing, data loading, auth/session access, resource policies, mutations, cache updates, and Electron wiring. Its connected containers compose imported UI views; they must not define presentation markup, styles, or use primitives to build views.
- UI receives application data, resolved capabilities, navigation targets, and callbacks. It must not import application code or perform domain data fetching, authorization, or persistence. Keep meaningful visual parts in focused component files and assemble them with composer components.
- New or moved presentation must be available in Storybook through the actual UI components, not a duplicate view. Keep the package boundary tests passing without exceptions that weaken this ownership.
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
