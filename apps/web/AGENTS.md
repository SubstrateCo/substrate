# Web application

- This app is purely the rendering layer for the Startup OS Electron desktop app, not a standalone browser-first product. Design its UI, navigation, and workflows for the desktop experience.
- Use TanStack Start with file-based routes. Keep route files thin.
- Limit UI route files to route configuration, data loading, access checks, redirects, and general page layout. Route components may read route context, params, search, and loader data and pass them to domain components. Keep component internals, including local interaction state, effects, event handlers, form logic, and detailed UI, in `src/components/<domain>/`, not in route files.
- Organize routes in directories that mirror their layout hierarchy. Use directory-based route files, not flattened dot-separated route filenames.
- Load shared session and application data at the highest common route layout. Return it through route context and reuse it in child routes. Do not repeat authentication checks or reload data already provided by a parent layout.
- Use TanStack server functions for backend calls from the web UI. Reserve API routes for external consumers, callbacks, and integrations such as Better Auth.
- Validate untrusted data with Zod at server-function and other input boundaries. TypeScript types are not runtime validation.
- Use static imports. Do not use dynamic imports to work around dependency injection, server-only boundaries, or import configuration; fix the underlying boundary or configuration instead.
- Group components in `src/components/<domain>/`. Use one file per component. A component's loading and error states may share its file.
- Install UI primitives with the shadcn CLI. Do not hand-write replacements for shadcn components.
- Put reusable TanStack Query option factories in `src/queries/<domain>/`. Use the shared query-key factory. Include the organization ID in organization-scoped keys.
- Use TanStack Query for fetched application state. Invalidate affected queries after mutations and clear private state on sign-out.
- Use Better Auth client APIs for authentication and organization actions. Use Better Auth server APIs for server-side session and membership checks.
- Never query the database in this app. Database setup and trusted actor provisioning belong in server-only packages and Better Auth hooks.
- Derive identity and actor scope on the server. Organization roles do not bypass entity grants.
- Require verified email for workspace access and invitation acceptance. Only organization owners may invite members.
- Test application policies and complete workflows. Do not test Better Auth internals or third-party guarantees.
- Use Playwright for UI behavior, accessibility, and layout tests. Do not assert against rendered HTML strings or HTML snapshots, including markup substring checks.

## Connected workflows

- Give shareable records stable, organization-aware navigation targets. Opening a reference must resolve the intended record and enforce access.
- Use structured entity references for supported internal mentions, not display names or copied URLs alone.
- When implementing a relationship, expose useful forward navigation and backlinks through existing domain surfaces.
- Keep reference creation, access changes, and notifications explicit. Show confirmation when an action expands access, especially across organizations.
- Do not expose inaccessible target metadata through labels, previews, autocomplete, backlinks, or counts.
- Preserve source context in creation workflows, such as creating a task from a message or email.
- Invalidate affected relationship and detail queries after mutations, not only the originating feature's list.
