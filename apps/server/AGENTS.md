# Server application

- Run on Bun with Hono. Prefer Hono APIs and official middleware over custom HTTP infrastructure.
- Put versioned application APIs in `src/v1/<domain>/`. Add `src/v2/<domain>/` only when a breaking contract requires it, not for each release.
- Each domain owns separate `routes.ts` and `service.ts` files. Split larger domains by responsibility.
- Keep routes thin: validate HTTP input, read request context, call a service, and map its result to an HTTP response. Do not put domain policy, database queries, or actor provisioning in routes.
- Validate untrusted request input with `@hono/zod-validator` middleware. Put browser-safe input schemas and common result contracts in `packages/contracts`.
- Services return `ServiceResult<T>` for success and expected failure. Use shared error codes and HTTP mapping. Do not expose database errors, stack traces, or inaccessible record metadata.
- Better Auth owns its HTTP protocol under `/api/auth`. Do not wrap its responses in the application result envelope.
- Send desktop email links through the public `/desktop/open` handoff. Use the shared desktop destination validator; never accept arbitrary redirects or forward session credentials to another origin.
- Keep Better Auth configuration, hooks, and session infrastructure in `src/auth/`, and email in `src/mail/`. The renderer uses Better Auth client APIs, never server imports.
- Keep persistence in `packages/database`. Share services and repositories across API versions; version adapters and contracts, not the database layer.
- Derive user identity, active organization, and actor scope from the authenticated session. Require verified email and membership. Organization owners and admins are super users: the database grants them owner access to their organization's records and lets them manage its conversations without reading private messages. Other roles do not bypass entity grants.
- Validate mutation origins against explicit trusted frontend origins. Never use wildcard credentialed CORS or disable Electron web security.
- Preserve structured source references, relationship permissions, and organization boundaries in connected workflows.
- Stay compatible with supported installed desktop clients. Prefer additive contracts and coordinate breaking API and database changes.
- Export the Hono application type for the renderer's typed RPC client. Client imports of server types must be type-only.
- Test application contracts, status/error mapping, validation boundaries, access policies, and workflows. Do not test Hono or Better Auth internals. Keep unit tests beside their domain.

## Agent work

- Agent-work device and host routes (`/agent-work/device/*`, `/agent-work/host/*`) require a verified session, a trusted origin, and a registered device, resolved once by `scopes.device`. Host wire contracts live in `@substrate/contracts/agent-work/control`.
- MCP calls require a `TurnContext` (`turnId`, `attempt`) for every tool, read or write. The turn must be live, in that attempt, and leased by the agent's home device, which must be the installation in the request header.
- Heartbeats renew the device's turn leases. A one-minute timer in `main.ts` ends turns whose host went away. A 30-second timer fires due routines; their work waits in the queue until the home host claims it.
- Owner work routes (`work-routes.ts`: activity, conversation work, turns, routines, and the turn, item and new-topic commands) are workspace scoped and reach only the caller's own agents. Their views and inputs live in `@substrate/contracts/agent-work`.
- Publish agent-work hints without data, to the owner's audience. The home host syncs on these hints, so owner commands reach it the same way.

## Integration tests

- Put request-only HTTP integration cases in `integration`, using API fixtures without browser pages or viewport matrices. Cover HTTP permission, origin, and isolation boundaries here; keep repository and transaction edge cases in database tests.
- Manually check native transport, visible permission controls, and removal of cached private content in Electron. Do not repeat the full API policy matrix through the UI.
