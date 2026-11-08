# Server application

- Run on Bun with Hono. Prefer Hono APIs and official middleware over custom HTTP infrastructure.
- Organize versioned application APIs in `src/v1/<domain>/`, then `src/v2/<domain>/` when a breaking contract requires it. Do not create a version for each release.
- Each domain owns separate `routes.ts` and `service.ts` files. Split larger domains by responsibility.
- Keep routes thin: validate HTTP input, read request context, call a service, and map its result to an HTTP response. Do not put domain policy, database queries, or actor provisioning in routes.
- Use `@hono/zod-validator` middleware for untrusted request input. Put browser-safe input schemas and common result contracts in `packages/contracts`.
- Application services return `ServiceResult<T>` for success and expected failure. Use shared error codes and HTTP mapping. Do not expose database errors, stack traces, or inaccessible record metadata.
- Better Auth owns its HTTP protocol under `/api/auth`. Do not wrap Better Auth responses in the application result envelope.
- Send desktop email links through the public `/desktop/open` handoff. Use the shared desktop destination validator; never accept arbitrary redirects or forward session credentials to another origin.
- Keep Better Auth configuration, hooks, mail, and session infrastructure in `src/auth/`. The renderer uses Better Auth client APIs, never server imports.
- Keep persistence in `packages/database`. Share services and repositories across API versions; version adapters and contracts, not the database layer.
- Derive user identity, active organization, and actor scope from the authenticated session. Require verified email and membership. Organization roles do not bypass entity grants.
- Validate mutation origins against explicit trusted frontend origins. Never use wildcard credentialed CORS or disable Electron web security.
- Preserve structured source references, relationship permissions, and organization boundaries in connected workflows.
- Preserve compatibility with supported installed desktop clients. Prefer additive contracts and coordinate breaking API and database changes.
- Export the Hono application type for the renderer's typed RPC client. Client imports of server types must be type-only.
- Test application contracts, status/error mapping, validation boundaries, access policies, and workflows. Do not test Hono or Better Auth internals. Keep unit tests beside their domain.

## Integration tests

- Put request-only HTTP integration cases in `integration`, using API fixtures without browser pages or viewport matrices. Cover HTTP permission, origin, and isolation boundaries here; keep repository and transaction edge cases in database tests.
- Manually check native transport, visible permission controls, and removal of cached private content in Electron. Do not repeat the full API policy matrix through the UI.
