# Startup OS

StartupOs is the all-in-one workspace for you and your team. It unifies email + messages + docs + tasks + agents + CRM into a single fast interface with shared team-level memory. Everything in your workspace is @linked and searchable so your team (and your agents) never have to switch tools.

## Desktop-first product

- Startup OS is meant to be consumed as an Electron desktop app. Design all features and workflows for that use case.
- The web app is purely the rendering layer for the desktop app, not a separate browser-first product.
- Make architecture, UI, navigation, and platform integration decisions with the Electron desktop experience in mind.

## Connected workspace

- Build features as parts of one workspace, not as isolated tools.
- For each feature, identify its relationships to existing actors, entities, conversations, projects, tasks, contacts, and other relevant records. Implement the relationships needed for the requested workflow.
- Distinguish structural relationships, contextual references, source/provenance links, permissions, and notifications. One must not implicitly substitute for another.
- When work is created from existing context, preserve a structured reference to its source where supported. Do not rely only on copied text.
- Make relationships navigable from both sides where useful, subject to access checks on each side.
- Reuse shared entity identity, permissions, and linking mechanisms where applicable. Keep explicit boundaries for cross-organization resources.
- Treat users, actors, and contacts as distinct concepts. Matching an identifier must not grant identity or access.
- If a required connection cannot be implemented within the task scope, report the gap and the decision needed. Do not silently introduce a disconnected alternative or build unrelated features.

## Code organization

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
