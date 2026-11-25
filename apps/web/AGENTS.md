# Web application

- Use Vite and TanStack Router file-based routes. Mirror layout hierarchy with route directories, not flattened dot-separated filenames.
- Limit routes to configuration, loading, access checks, redirects, and composition of imported layouts. Routes may pass context, params, search, and loader data to connected containers.
- Web owns renderer presentation and application integration. Group presentation and connected containers in `src/components/<domain>/`, one file per container, and import them through `@/components` paths.
- Split large views into focused components. Connected containers compose these views and pass data, navigation targets, callbacks, and connected content through props, slots, or render callbacks.
- Keep data fetching, query options, mutations, invalidation, session/auth clients, resource access decisions, routing, and Electron integration in web. Keep purely visual state, focus/scroll effects, form drafts, and interaction behavior in UI. State that controls a query or application action may remain in a connected container.
- Loading, error, empty, pending, and unavailable views belong in UI and receive their state from the container.
- Load shared session and application data in the highest common layout and reuse its route context. Do not repeat those loads or session checks; keep resource-specific access checks.
- Use the Hono `hc` RPC client in `src/api/` for same-origin backend calls. Import the server's `AppType` as a type only. Better Auth uses its native client protocol under `/api/auth`.
- Keep runtime server code, secrets, database access, setup, and actor provisioning out of the renderer. Share browser-safe contracts through `@substrate/contracts`.
- The server validates untrusted input and derives identity and actor scope. Organization owners and admins are super users for their organization's records and conversation management; other roles do not bypass entity grants.
- Do not use dynamic imports to bypass dependency injection, server-only boundaries, or import configuration. Fix the underlying issue.
- Add a variant only when two or more places need a visible difference that no existing variant gives, and delete a variant when its last use goes.
- Add or change UI primitives in `src/components/ui` with the shadcn CLI. Do not hand-write replacements. Hand-write a primitive only when shadcn has none, as with `Heading`, `Image`, and `Pressable`.
- Put reusable TanStack Query option factories in `src/queries/<domain>/`. Use the shared query-key factory. Include the organization ID in organization-scoped keys.
- Use TanStack Query for fetched application state. Invalidate affected queries after mutations and clear private state on sign-out.
- Use Better Auth client APIs for authentication and organization actions. The server owns session and membership checks.
- Require verified email for workspace access and invitation acceptance. Organization owners and admins may invite members; admins cannot invite owners.

## Design

- Follow `DESIGN.md`, the design contract for primitives, shared components, icons, dates, copy, spacing, and motion.
- Compose all renderer components from the shared UI primitives in `apps/web/src/components/ui`, directly or through existing shared building blocks. Do not hand-build replacements or duplicate their styles and behavior.
- Before adding or changing guidance in `DESIGN.md`, first check whether ShadCN lint configuration, a custom deterministic lint rule, types, a shared component, or a focused test can enforce it. Prefer enforcement over prose. Keep semantic guidance only when deterministic enforcement is not practical, and remove covered prose when enforcement is added.
- Fix `design/*` and `shadcn/*` lint errors and warnings in files you touch. Diagnostics name the component or helper to use; some also point to a `DESIGN.md` section.
- Style with shared components and the tokens in `src/components/styles.css`, so pages do not drift apart. Do not add CSS files, and rarely change the shared styles. Write CSS only when nothing else works, such as making an external library match our styles.
- If a warning is wrong for a case, explain it in `// oxlint-disable-next-line <rule> -- <reason>`. Do not weaken a rule or a primitive to silence it.

## Tests

- Test application policies and complete workflows. Do not test Better Auth internals or third-party guarantees.
- Do not add Storybook or presentation package boundary tests.
- Use headless Playwright in `e2e` for shared renderer workflows and responsive layout checks. Check native behavior, accessibility, and desktop rendering manually in Electron.
- Do not add manual `page.screenshot()` calls to E2E specs. Failure screenshots run automatically; when visual review screenshots are needed, use `captureScreenshot` from `e2e/test-support/screenshots.ts` with `E2E_CAPTURE_SCREENSHOTS=1` or `E2E_SCREENSHOTS_DIR`.
- Do not assert against rendered HTML strings or HTML snapshots, including markup substring checks.
- Keep non-UI rules and cache logic in unit tests. Put HTTP security and permission matrices in `apps/server/integration`, not in long UI journeys or viewport loops.

## Connected workflows

- Give shareable records stable, organization-aware navigation targets that resolve the intended record and enforce access.
- Use structured entity references for supported internal mentions.
- Expose useful forward links and backlinks through existing domain UI.
- Confirm actions that expand access, especially across organizations.
- Do not leak inaccessible metadata through labels, previews, autocomplete, backlinks, or counts.
- After mutations, invalidate affected relationship and detail queries, not just the originating feature's list.

## Agent work

- Show agent work only to the agent's owner. Callers see only the status of their own calls and published messages, not the owner's work, approvals, allowlist, or Calls log.
- Read local work through the `substrateAgentWork` bridge on the home desktop. Elsewhere, fall back to server status and requests.
- Place work under its outputs, then under its newest accessible source message. Work without an anchor appears only in the Agents app.
- Notify only for Needs-you items, not for working, finished, quiet, or routine progress.
- Show records the viewer cannot open as placeholders, such as "A conversation you can't open". Never show their names.
