# Pseudo call stack notation

A pseudo call stack shows how one entrypoint crosses layers. It is not a full
trace. It shows one frame per layer crossing, plus the validation, middleware,
and vendor calls that matter.

## Format

```text
<METHOD> <full path>                                    <route file>:L<line>
  <kind>  <call or name>                                <file>[:L<line>] | <package>
    <kind>  <nested call>                               ...
```

- Indent two spaces per level. Nesting means "called during".
- Put the location column at the right. Use repo-relative paths, and
  shorten them when the stack makes them clear (`shared/scope.ts`).
- Put a finding on the frame it belongs to: `!! <rule> <tag>: <short what>`.

## Frame kinds

| Kind | Use for |
| --- | --- |
| `mw` | Middleware. List global middleware once in a `mw*` line, or in a shared header block. |
| `valid` | Schema validation, with the schema name and where it lives. |
| `route` | The handler body. Show it only when it does more than one call. |
| `svc` | A service method. |
| `adapter` | An adapter around a vendor (storage, mail, queue). |
| `db` | A repository or database call. This is a leaf. Do not trace into SQL. |
| `3p` | A direct vendor call. This is a leaf. |
| `pkg` | An internal shared package that is not a layer (utilities, contracts helpers). |
| `out` | Response mapping or output sanitizing. |
| `err` | Error mapping, when it is not the shared mapper. |

## Collapse rules

- Merge same-layer helpers into the frame that calls them. Show a helper
  only when it crosses a layer or has a finding.
- Show a branch only when it crosses a layer: `if invoice.overdue → svc notify`.
- Stop at `db` and `3p` frames.
- Write each repeated call once, with a count: `db  invoiceRepo.findById ×N`.
  An unexpected loop of database calls is worth a short note.
- Keep each stack under about 25 lines. If it is longer, the endpoint likely
  has an R2 problem. Say so.

## Example: clean endpoint

```text
mw*  helmet, cors, json body limit 1MB, requestId                   src/app.ts:L20-31

GET /api/invoices/:id                                               src/invoices/routes.ts:L14
  mw      requireSession                                            src/middleware/auth.ts
    3p      auth-provider verifyToken
  valid   params(invoiceIdParams)                                   src/contracts/invoices.ts
  svc     invoices.get(user, id)                                    src/invoices/service.ts:L22
    db      invoiceRepo.findForOwner(user.orgId, id)                src/db/invoices.ts
  out     toInvoiceResponse(result)                                 src/invoices/mappers.ts
```

## Example: endpoint with findings

```text
POST /api/invoices/:id/send                                         src/invoices/routes.ts:L31
  mw      requireSession                                            src/middleware/auth.ts
  route   handler
    !! R3 validate: reads req.body.email without a schema
    db      invoiceRepo.findById(id)                                src/db/invoices.ts
      !! R1 bypass: route calls the repository
    route   if invoice.status === "paid" → 409
      !! R2 move: domain rule in the route
    3p      postmark.sendEmail(...)
      !! R5 vendor: SDK called from the route
  out     res.json(invoice)
    !! R4 sanitize: returns the raw row, with internalNotes
```

## Fix plan diff

Show the target shape as a diff of the stack:

```diff
 POST /api/invoices/:id/send
   mw      requireSession
+  valid   body(sendInvoiceRequest)
-  route   handler
-    db      invoiceRepo.findById(id)
-    route   if invoice.status === "paid" → 409
-    3p      postmark.sendEmail(...)
+  svc     invoices.send(user, id, { email })
+    db      invoiceRepo.findForOwner(user.orgId, id)
+    svc     assertSendable(invoice)            → ConflictError
+    adapter mailer.sendInvoice(...)
+      3p      postmark.sendEmail
-  out     res.json(invoice)
+  out     toInvoiceResponse(result)
```

## Many endpoints

When endpoints share a prefix, write the shared frames once:

```text
/api/invoices/*   shared: mw* + requireSession + toInvoiceResponse
  GET  /           valid listQuery        → svc invoices.list   → db invoiceRepo.listForOwner
  GET  /:id        valid invoiceIdParams  → svc invoices.get    → db invoiceRepo.findForOwner
  POST /:id/send   valid sendRequest      → svc invoices.send   → db invoiceRepo.findForOwner, adapter mailer → 3p postmark
```

Use the full form only for endpoints with findings.
