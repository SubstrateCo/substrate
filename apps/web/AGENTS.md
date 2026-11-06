# Web application

- Use Vite and TanStack Router file-based routes. Mirror layout hierarchy with route directories, not flattened dot-separated filenames.
- Keep routes limited to configuration, loading, access checks, redirects, and page layout. Routes may pass context, params, search, and loader data to components in `src/components/<domain>/`.
- Keep detailed UI, local state, effects, handlers, and forms in domain components.
- Load shared session and application data in the highest common layout and reuse its route context. Do not repeat those loads or session checks; keep resource-specific access checks.
- Use the Hono `hc` RPC client in `src/api/` for same-origin backend calls. Import the server's `AppType` as a type only. Better Auth uses its native client protocol under `/api/auth`.
- Keep runtime server code, secrets, database access, setup, and actor provisioning out of the renderer. Share browser-safe contracts through `@startup-os/contracts`.
- The server validates untrusted input and derives identity and actor scope. Organization roles do not bypass entity grants.
- Do not use dynamic imports to bypass dependency injection, server-only boundaries, or import configuration. Fix the underlying issue.
- Group components in `src/components/<domain>/`. Use one file per component. A component's loading and error states may share its file.
- Install UI primitives with the shadcn CLI. Do not hand-write replacements for shadcn components.
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
