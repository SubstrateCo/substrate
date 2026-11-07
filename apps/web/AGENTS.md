# Web application

- Use Vite and TanStack Router file-based routes. Mirror layout hierarchy with route directories, not flattened dot-separated filenames.
- Keep routes limited to configuration, loading, access checks, redirects, and composition of imported layouts. Routes may pass context, params, search, and loader data to connected containers in `src/components/<domain>/`.
- Web owns both renderer presentation and application integration. Group presentation in `src/components/<domain>/` and import it through `@/components` paths.
- Keep large views split into focused components with meaningful responsibilities. Connected containers can compose these views and pass data, navigation targets, callbacks, and connected content through props, slots, or render callbacks.
- Keep data fetching, query options, mutations, invalidation, session/auth clients, resource access decisions, routing, and Electron integration in web. Keep purely visual state, focus/scroll effects, form drafts, and interaction behavior in UI. State that controls a query or application action may remain in a connected container.
- Load shared session and application data in the highest common layout and reuse its route context. Do not repeat those loads or session checks; keep resource-specific access checks.
- Use the Hono `hc` RPC client in `src/api/` for same-origin backend calls. Import the server's `AppType` as a type only. Better Auth uses its native client protocol under `/api/auth`.
- Keep runtime server code, secrets, database access, setup, and actor provisioning out of the renderer. Share browser-safe contracts through `@startup-os/contracts`.
- The server validates untrusted input and derives identity and actor scope. Organization roles do not bypass entity grants.
- Do not use dynamic imports to bypass dependency injection, server-only boundaries, or import configuration. Fix the underlying issue.
- Group connected containers in `src/components/<domain>/`. Use one file per container. Loading, error, empty, pending, and unavailable views belong in UI and receive their state from the container.
- Add or change UI primitives in `src/components/ui`, using the shadcn CLI. Do not hand-write replacements.
- Do not add Storybook or presentation package boundary tests. Validate UI workflows through the Electron app.
- Put reusable TanStack Query option factories in `src/queries/<domain>/`. Use the shared query-key factory. Include the organization ID in organization-scoped keys.
- Use TanStack Query for fetched application state. Invalidate affected queries after mutations and clear private state on sign-out.
- Use Better Auth client APIs for authentication and organization actions. The server owns session and membership checks.
- Require verified email for workspace access and invitation acceptance. Only organization owners may invite members.
- Test application policies and complete workflows. Do not test Better Auth internals or third-party guarantees.
- Use Playwright for UI behavior, accessibility, and layout tests. Do not assert against rendered HTML strings or HTML snapshots, including markup substring checks.

## Connected workflows

- Give shareable records stable, organization-aware navigation targets that resolve the intended record and enforce access.
- Use structured entity references for supported internal mentions.
- Expose useful forward links and backlinks through existing domain UI.
- Confirm actions that expand access, especially across organizations.
- Do not leak inaccessible metadata through labels, previews, autocomplete, backlinks, or counts.
- After mutations, invalidate affected relationship and detail queries, not just the originating feature's list.
