---
name: database-table-design
description: >
  Design and change Substrate database tables and the links between records. Use
  before you add or change a table, column, foreign key, index, entity type,
  relation type, or join table in packages/database, and when you decide how two
  records connect across apps (tasks, CRM, contacts, messaging, projects): "add
  a table", "store X", "link X to Y", "new entity type", "track history", "make
  this idempotent", "where did this record come from".
---

## Philosophy

Substrate is one platform, not a set of apps that each own their data. All apps are built from the same primitives, so each record can refer to each other record. Context builds itself as people work.

The primitives:

- **Organization:** the boundary for each record, grant, and link.
- **Entity:** one identity for each record of each type (`entities`).
- **Actor:** one identity for each person and agent.
- **Access container and grants:** one permission model for all record types.
- **Relationships:** structure, `entity_links`, and `message_entity_references`.

A task made from a message keeps a reference to that message. A deal mentioned in a channel gets a backlink. A person or an agent who opens a record can follow these connections to all the related work that they are permitted to see.

Design rules that follow:

- **Join the graph.** A new record type is an entity that uses the shared identity, access, and relationship mechanisms. A table that only its own feature can reach is a defect.
- **Reuse a primitive before you add one.** A second way to link, grant, or record history splits the graph, and context queries miss part of it.
- **Capture context when the work happens.** Write the reference in the same transaction as the record.
- **Store references, not copies.** A structured reference keeps navigation, backlinks, and access checks. Copied text loses them.
- **Context never leaks.** Each connection is filtered by the reader's access on both ends.
- **Build only real connections.** Do not add placeholder types or speculative link types.

The test for a design: can a person or an agent reach this record from any related record, and does the access model decide whether they see it?

## Steps

Follow the steps in order. Most requests end at step 1 or 2 with no new table. Paths are relative to `packages/database/src`.

## 1. Check that you need a table

| Job | Use this | Not this |
| --- | --- | --- |
| Provenance | A `source` row in `message_entity_references`, or a `related_to` link, in the same transaction | A provenance table for each workflow |
| Retries | `previousRequest()` and `recordRequest()` from `core/requests/once.ts`, with a new value in `requestOperations` | A request table for each workflow |
| History | The domain activity table (`task_activity`, `crm_activity_events`) | An event table for one field or action |
| Derived references | Read them from the content on each read | A table that stores what the content holds |
| Integration sync state | Columns on the feature's connection record | A generic integration or sync-state table |

## 2. Choose the relationship mechanism

Each relationship uses exactly one mechanism. Take the first row that fits.

| Question | Mechanism | Examples |
| --- | --- | --- |
| Does it define where a record belongs or who is responsible for it? Does it have its own fields? | **Structure:** a foreign key or join table in the owning domain | task → project, assignee, `crm_deal_contacts` |
| Are two entities related, but neither one belongs to the other? | **Record context:** `entity_links` | a task about a deal |
| Is one end a message? | **Message context:** `message_entity_references` | a task created from a message |

Messages are not entities, so they cannot use `entity_links`.

**`entity_links`**

- `related_to` has no direction. Store it once, in ID order, with `relatedPair()`. Write it through `linkRepository`, or in the transaction of the domain workflow that creates it.
- `blocks` and `duplicates` are task relations. Only the task domain writes them.
- Add a relation type only for a real feature. Add it to `relationTypes` in `core/links/schema.ts`, and give one domain its write path and type checks.

**`message_entity_references`**

The `purpose` values are independent. Removing one never removes another.

- `source`: a workflow created the record from the message.
- `mention`: the reference is parsed from the message body.
- `association`: a person attached the message by hand.

**All relationships**

- Do not copy a structural relationship into `entity_links`.
- Validate organization, entity type, lifecycle state, and access. Writing a link needs edit access on the record being changed and view access on the other record.
- Linking does not grant access or send notifications. Readers see a link only when they can read both ends.
- Context queries combine all three mechanisms and apply each domain's access rules.
- Define what happens to each relationship on deletion, restoration, and reparenting.
- A connection across organizations needs a dedicated sharing boundary. Never weaken organization-scoped grants, links, or foreign keys.

If a required connection is out of scope, report the gap. Do not build a disconnected substitute.

## 3. Place the file

- Shared primitives go in `core/<domain>/`. Feature tables go in `features/<feature>/`. Core must not import feature code.
- Name the file `schema.ts`, or `<group>.schema.ts` when the domain has more than one table group.
- Export it from `schema/index.ts`, after the files it references. Drizzle reads only that registry.

## 4. Write the table

**Columns**

- An entity-backed table has `entity_id` as its primary key and no separate `id`.
- Each organization-owned table has `organization_id`.
- A column that refers to an entity ends in `_entity_id` and names the role: `project_entity_id`, `assignee_actor_entity_id`.
- Timestamps use `{ withTimezone: true }`.
- For a small closed set of values, use `text().$type<...>()` and a `check`. Use `pgEnum` only for a type that many tables share.
- `entities` has `created_at`, `updated_at`, and `deleted_at`. Do not repeat them on an entity-backed table.

**Foreign keys**

- A foreign key to an organization-owned table is composite and starts with `organization_id`. This makes a cross-organization reference impossible. The target needs a matching `unique(organization_id, <key>)`.
- Decide `onDelete` for each one. Rows that are part of the parent cascade. A reference to an actor does not.

**Root entity table**

```ts
export const projects = pgTable(
  "projects",
  {
    ...entityIdentity("project"), // entity_id, organization_id, generated entity_type
    name: text("name").notNull(),
  },
  (table) => [
    // Binds the row to an entity of the correct organization and type.
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    // Lets other tables reference this one with a composite key.
    unique("projects_organization_entity_unique").on(table.organizationId, table.entityId),
    check("projects_name_check", sql`length(trim(${table.name})) BETWEEN 1 AND 200`),
  ],
);
```

**Child entity table**

A child takes its access from its parent. Add the structural foreign key, and a second one that proves the parent is the access container. See `features/tasks/tasks.schema.ts`.

```ts
// Structure: the task belongs to the project.
foreignKey({
  columns: [table.organizationId, table.projectEntityId],
  foreignColumns: [projects.organizationId, projects.entityId],
}),
// Access: the project is the task's access container.
foreignKey({
  columns: [table.organizationId, table.entityId, table.projectEntityId],
  foreignColumns: [entities.organizationId, entities.entityId, entities.accessEntityId],
}),
```

**Join table**

A join table is not an entity. It has an `id`, `organization_id`, one composite foreign key for each end, and a unique constraint on the pair. Copy `crm_deal_contacts` in `features/crm/schema.ts`.

**Indexes**

Do not add an index by default. Each one slows every write. Add one only when you can name the query that needs it.

- Primary keys and `unique` constraints are already indexes on their leading columns. Check them first.
- Add an index when a new query filters or sorts a table that grows without limit, and no existing index serves it.
- PostgreSQL does not index the referencing side of a foreign key. Index it only when the parent is deleted in normal use and the child table grows large.
- Start with `organization_id` only when the query filters by organization and then sorts or ranges.
- Use a partial index only when most rows are null.

## 5. Add an entity type

An enum value alone is not an implemented domain. A new type needs all of these:

1. The value in `entityType` in `core/entities/schema.ts`.
2. The domain table, with `entityIdentity("<type>")`.
3. The export in `schema/index.ts`.
4. `message_reference_type_check` in `features/context/schema.ts`, if messages can reference the type.
5. `adminEntityTypes` in `core/permissions/visibility.ts`, only if the domain is shared with the organization.
6. Any activity table that lists entity types in a check, such as `crm_activity_entity_type`.

## 6. Access

A table design is not complete until its write path enforces access.

- Each entity has an access container in `entities.access_entity_id`. A root is its own container. A child uses its parent's. Grants are set on containers only.
- Create a root with `context.createEntity(type)`. Create a child with `context.createChildEntity(type, parent)`, where `parent` comes from `requireAccess(parentId, "edit", true)`.
- A move updates the container and the structural references together. Do not expose raw `access_entity_id` edits.
- Filter lists with `context.readable(entityId)`. Do not store admin grants.
