# Antipatterns

Each rule has an ID, a tag, a detection method, and a fix. Rule IDs are
stable, so project configs, exceptions, and findings can refer to them. A
project can add rules with new IDs (for example `C1` for contracts). Do not
reuse an ID for a different meaning.

**Detect** says who can find the problem:

- **lint:** the architecture lint flags it from imports, calls, or syntax.
  Encode it as a config rule.
- **read:** only reading the code finds it.
- **lint+read:** the lint flags candidates, and reading confirms them.

## Tags

| Tag | Meaning | The replacement names |
| --- | --- | --- |
| `bypass` | A layer is skipped (route → database, service → SQL). | The method to add in the skipped layer. |
| `move` | Logic is in the wrong layer. | The target layer and function. |
| `validate` | Validation is missing, duplicated, or in the wrong layer. | Where the validation belongs. |
| `sanitize` | A raw record, error, or internal field leaks across the boundary. | The mapper or contract to use. |
| `vendor` | A vendor SDK is called outside an adapter or allowed layer. | The adapter to call or create. |
| `upward` | A lower layer depends on a higher one. | How to invert the dependency. |
| `cycle` | Two layers import each other. | Which direction to remove. |
| `duplicate` | A check repeats one that an earlier frame or a lower layer already made. | The frame that already guarantees it. |
| `drift` | Two places encode the same rule, and they disagree or can. | The single owner, and the case where they differ. |

## Route layer (R)

A route owns transport only: parse, authorize through middleware, call one
service method, map the result.

**R1 `bypass`: route calls persistence.** Detect: lint+read.
- Signs: the route imports the database layer, an ORM, or an adapter, or it
  calls repositories or a database client.
- Why: access rules and business rules are spread across routes and cannot
  be reused.
- Fix: add or reuse a service method. The route passes in the validated
  input.

**R2 `move`: business logic in the route.** Detect: read.
- Signs:
  - The route branches on domain state.
  - It loops over records.
  - It computes domain values such as totals, status, or permissions.
  - It calls more than one service method in sequence.
  - It builds domain objects.
- Not a sign: choosing a status code from a result, or reading
  request-context values to pass along.
- Fix: move the logic into the service. The route makes one call.

**R3 `validate`: untrusted input is not validated.** Detect: lint+read.
- Signs: the route reads the body, query, params, or headers without a
  schema validator, or it casts the input with `as`.
- Fix: use validator middleware with a schema from the shared contracts.

**R4 `sanitize`: raw output or errors leak.** Detect: lint+read.
- Signs:
  - The route returns raw rows, internal IDs, secrets, or fields from
    records that the caller cannot access.
  - It returns raw driver errors or vendor errors, or stack traces.
  - It has per-route try/catch blocks that each build their own error
    shape.
- Fix: return a response contract. Use the shared error mapper.

**R5 `vendor`: route calls a vendor SDK.** Detect: lint.
- Allowed: the HTTP framework, its official middleware, and the validator.
- Fix: put the SDK behind an adapter and call it from a service.

## Service layer (S)

A service owns business logic. It takes plain, already-validated values and
returns a result type. The same service can serve HTTP, jobs, CLI, or tests.

**S1 `upward`: service knows about HTTP.** Detect: lint+read.
- Signs:
  - The service imports framework types (`Context`, `Request`).
  - It reads headers or cookies.
  - It returns `Response` objects or status codes.
  - It throws HTTP exceptions.
- Fix: the route extracts values and passes them in. The service returns a
  result or an error code, and the route maps it.

**S2 `bypass`: service builds queries.** Detect: lint.
- Signs: the service imports an ORM, a query builder, a SQL client, or table
  schemas.
- Fix: add a repository method. The service calls it.

**S3 `validate`: service re-parses transport input.** Detect: read.
- Signs: the service runs the same schema that the route already applied.
- Not a sign: checks of domain invariants, such as "the due date is after
  the start date" or "a closed task cannot be reassigned". Those belong
  here.
- Fix: accept the parsed type. Keep the invariant checks.

**S4 `vendor`: service constructs vendor clients.** Detect: lint.
- Signs: the service imports an SDK directly (object storage, mail, queue,
  AI provider)
  instead of receiving an injected adapter.
- Fix: inject an adapter interface at composition time.

## Database layer (D)

The database layer owns persistence. It accepts typed values and returns
plain records.

**D1 `validate`: database validates request input.** Detect: lint+read.
- Signs: a repository parses request payloads, checks user-provided shape,
  or imports request input schemas.
- Not signs:
  - Decoding stored values, such as JSON columns or enums read from rows.
  - Database constraints.
  - Compare-and-set state checks.
  - Integrity guards that need the transaction.
- Fix: validate shape in the route and domain rules in the service. The
  repository accepts typed values.

**D2 `move`: workflows in the database layer.** Detect: read.
- Signs:
  - A repository sends mail, publishes events, or calls services.
  - It makes multi-step domain decisions that one consistent write does
    not need.
- Not signs: a transactional outbox write, or a policy that a project rule
  puts in the database on purpose (for example row-level access scoping).
- Fix: the repository exposes the write primitive, and the service runs the
  workflow.

**D3 `upward`: database imports upper layers.** Detect: lint.
- Signs: imports from routes, services, middleware, the HTTP framework, or
  app config.
- Fix: invert the dependency. The caller passes values or callbacks in.

**D4 `vendor`: database calls non-persistence vendors.** Detect: lint.
- Signs: object storage, mail, HTTP clients, or AI calls inside
  repositories.
- Fix: move the call to a service or adapter.

**D5 `sanitize`: persistence details escape.** Detect: read.
- Signs: the layer returns query builders or lazy cursors, or it lets raw
  driver errors (unique violation codes) reach callers.
- Fix: return plain records. Map driver errors to domain errors such as
  conflict or not found.

## Middleware (M)

Middleware owns cross-cutting concerns: session, auth, origin checks, CORS,
limits, headers, metrics, and request scope.

**M1 `move`: domain logic in middleware.** Detect: read.
- Signs: endpoint-specific business rules, or domain writes, in middleware.
- Fix: move them into the service that the endpoint calls.

## Permissions (P)

Permissions follow the ownership table in "Permission boundary" in
[../SKILL.md](../SKILL.md). Each rule below names a search that finds
candidates. Run the searches across the scope, including web and mobile
clients: drift usually sits in files that no single stack visits.

**P1 `bypass`: a feature builds its own permission check.** Detect: lint+read.
- Signs:
  - Feature code writes grant, role, level or admin SQL itself.
  - It calls the central layer's SQL builders directly instead of its API.
  - It ranks levels by hand (`indexOf` on the level list, a local rank map).
  - It computes "who can read X" for fan-out (realtime, notifications)
    with a rule of its own.
- Search: calls of `adminRoleCondition`, `organizationAdminCondition`,
  `isOrganizationAdmin`, `entityAccessLevel`, `readableCondition`; imports
  of the grants table; `enumValues.indexOf`; `role ===`.
- Not a sign: a set-based query that must check other actors' access in
  one statement, such as fan-out over recipients. Record it as a config
  exception with a reason. It must still call the central builder, not a
  copy of it.
- Fix: call the central API. In this repository: `requireAccess(id, minimum,
  { type })`, `readable(id, minimum, type)`, `accessLevel`,
  `actorsWithAccess`, `requireOrganizationAdmin`, or `deny`, and
  `entityReaders` for fan-out over many actors. Lint rule P1 covers the
  builder calls.
- Performance: a check evaluated once per actor (a correlated access
  subquery over every person in the organization) grows with organization
  size. Use the set form (`entityReaders`) so it runs once.

**P2 `duplicate`: a check repeats a guarantee.** Detect: read.
- Signs:
  - The code re-checks the session's own actor, organization or
    installation after the scope middleware resolved it.
  - An entity-type check follows an access call that could take the type.
  - An app-enabled check comes right before an access call that already
    gates the app.
  - The code reads a row a second time because the core write it calls
    reads it too.
  - Clients guard a server-resolved boolean again (`canManage && !task`).
- Search: `requireActiveActor()` with no argument in feature code;
  `entityType !==` after `requireAccess`; `requireAppEnabled` within a few
  lines before `requireAccess`; the same `if (...) throw` at the top of many
  methods.
- Not a sign: an app check at a list entry point, where no record is read
  that could report the app. Not a sign: a re-check that a comment ties to
  a race the write must close, such as "check ownership again last".
- Fix: delete the repeat and name the frame that guarantees it. Keep one
  central check. Move tests that asserted the repeat to the frame that owns
  it, such as the session boundary.

**P3 `move`: a permission rule has the wrong owner.** Detect: read.
- Signs:
  - The central layer hardcodes lists of another domain's types: admin-owned
    types, member-edited types, apps that gate creation.
  - Routes or services parse roles or decide admin-only actions.
  - Visual components decide capabilities.
  - One module mixes permission rules with display rules.
- Search: string lists of entity types in core; `role.split`, `roles[`,
  `organizationSettingsAccess` outside contracts and its callers;
  `level === "owner"` in component files.
- Fix: the owning domain registers the rule (in this repository,
  `packages/contracts/src/<domain>/access.ts`), and the central layer reads
  the registry. Role policy goes to contracts. Client decisions go to the
  query or lib layer as resolved flags.

**P4 `drift`: clients re-derive capabilities.** Detect: read.
- Signs:
  - Web and mobile each turn a raw level, role or archived flag into "can
    edit" or "can manage".
  - Two clients disagree with each other or with the server, for example
    on archived records, the last owner, or who is assignable.
- Search: `level === "edit"`, `level === "owner"`, `canEdit(`,
  `canManage`, label maps for levels, in `apps/web` and `apps/mobile`.
- Fix: one shared capability helper in contracts. Add a server flag where
  the client lacks a fact the rule needs, such as another actor's access.
  For each disagreement, write which side is right before you change code.

## Cross-layer (X)

**X1 `cycle`: layers import each other.** Detect: scan (the Cycles section).
- Fix: remove the upward edge. Often a shared type sits in the wrong layer.
  Move it down to a shared leaf layer.
- The scanner finds cycles between two layers only. A cycle between
  layers with `mayImport` lists also fails the lint as X3.

**X2 `move`: one file spans several layers.** Detect: read.
- Signs: a route file that also has repository code, or a "service" file
  that is mostly handlers.
- Fix: split the file by layer.

**X3 `upward`: a layer imports a layer it may not.** Detect: lint (built in).
- Signs: an import whose target layer is not in the importing layer's
  `mayImport` list. Type-only imports count.
- Fix: invert the dependency, or move the shared code to a layer that both
  sides may import.

## Writing project rules

Project rules go in `architecture.config.json` (see
[scanner.md](scanner.md)). Encode only rules that an import, call, or syntax
check can approximate. Leave the rules marked `Detect: read` to the read pass.
When a project instruction contradicts a default here, the project wins.
Record the difference as an exception or a custom rule, so the next run
does not report it again.
