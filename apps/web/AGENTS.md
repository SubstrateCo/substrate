# Web application

- Use TanStack Start with file-based routes. Keep route files thin.
- Group components in `src/components/<domain>/`. Use one file per component. A component's loading and error states may share its file.
- Install UI primitives with the shadcn CLI. Do not hand-write replacements for shadcn components.
- Put reusable TanStack Query option factories in `src/queries/<domain>/`. Use the shared query-key factory. Include the organization ID in organization-scoped keys.
- Use TanStack Query for fetched application state. Invalidate affected queries after mutations and clear private state on sign-out.
- Use Better Auth client APIs for authentication and organization actions. Use Better Auth server APIs for server-side session and membership checks.
- Never query the database in this app. Database setup and trusted actor provisioning belong in server-only packages and Better Auth hooks.
- Derive identity and actor scope on the server. Organization roles do not bypass entity grants.
- Require verified email for workspace access and invitation acceptance. Only organization owners may invite members.
- Test application policies and complete workflows. Do not test Better Auth internals or third-party guarantees.
