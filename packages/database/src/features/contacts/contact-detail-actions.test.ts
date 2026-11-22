import { AccessDeniedError, ConflictError } from "../../errors";
import { ActorRepositories } from "../../repositories";
import { actors, entities } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { crmActivityEvents } from "../crm/activity.schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

async function seeded() {
  const a = f.forActor(f.alice);
  const contact = await a.contacts.createContact({ displayName: "Customer" });
  const base = { organizationId: f.orgA, contactEntityId: contact.entityId };
  for (let index = 0; index < 5; index++) {
    await a.contacts.mutateContactDetail({
      ...base,
      action: "addAddress",
      city: `City ${index}`,
      isPrimary: index === 0,
    });
    await a.contacts.mutateContactDetail({
      ...base,
      action: "addUrl",
      url: `https://${index}.example`,
      isPrimary: index === 0,
    });
  }
  const primary = await a.contacts.mutateContactDetail({
    ...base,
    action: "addIdentifier",
    type: "email",
    value: "primary@example.com",
    isPrimary: true,
  });
  const other = await a.contacts.mutateContactDetail({
    ...base,
    action: "addIdentifier",
    type: "email",
    value: "other@example.com",
  });
  if (!("id" in primary) || !("id" in other)) throw new Error("Expected identifier results.");
  return { contact, base, primary, other };
}

const updates = async (entityId: string) =>
  (await f.db.select().from(crmActivityEvents).where(eq(crmActivityEvents.entityId, entityId)))
    .filter((row) => row.action === "updated")
    .map((row) => row.changedFields);

test("detail snapshots read only the affected collection and record only real changes", async () => {
  const { contact, base, primary, other } = await seeded();
  const activityBefore = (await updates(contact.entityId)).length;
  const tracked = recordQueries();
  const bob = new ActorRepositories(tracked.db, { organizationId: f.orgA, actorEntityId: f.bob });
  const detailReads = (table: string) =>
    tracked.queries.filter((query) => query.startsWith("select") && query.includes(`"${table}"`));

  await bob.contacts.mutateContactDetail({
    ...base,
    action: "updateIdentifier",
    id: other.id,
    type: "email",
    value: "other@example.com",
  });
  // The access check, the profile, two snapshots, and the repository edit's own four.
  expect(tracked.queries).toHaveLength(8);
  expect(detailReads("contact_identifiers")).toHaveLength(3);
  expect(detailReads("contact_addresses")).toEqual([]);
  expect(detailReads("contact_urls")).toEqual([]);
  expect(await updates(contact.entityId)).toHaveLength(activityBefore);

  tracked.queries.length = 0;
  // Selecting another primary changes both rows. The whole collection detects the switch.
  await bob.contacts.mutateContactDetail({
    ...base,
    action: "updateIdentifier",
    id: other.id,
    type: "email",
    value: "other@example.com",
    isPrimary: true,
  });
  expect(detailReads("contact_addresses")).toEqual([]);
  expect(await updates(contact.entityId)).toHaveLength(activityBefore + 1);
  const detail = await f.forActor(f.alice).contacts.getDetail(contact.entityId);
  expect(detail.identifiers.find((row) => row.id === primary.id)?.isPrimary).toBe(false);
  expect(detail.identifiers.find((row) => row.id === other.id)?.isPrimary).toBe(true);

  tracked.queries.length = 0;
  await bob.contacts.mutateContactDetail({ ...base, action: "addUrl", url: "https://new.example" });
  expect(detailReads("contact_identifiers")).toEqual([]);
  expect(detailReads("contact_addresses")).toEqual([]);
  expect((await updates(contact.entityId)).at(-1)).toEqual(["url"]);
  expect(detail.addresses).toHaveLength(5);
});

test("failed detail mutations roll back without activity, and access rules are unchanged", async () => {
  const { contact, base, other } = await seeded();
  const before = await f.forActor(f.alice).contacts.getDetail(contact.entityId);
  const activityBefore = await updates(contact.entityId);
  const bob = f.forActor(f.bob).contacts;
  expect(
    await rejection(
      bob.mutateContactDetail({
        ...base,
        action: "updateIdentifier",
        id: other.id,
        type: "email",
        value: "primary@example.com",
        isPrimary: true,
      }),
    ),
  ).toBeInstanceOf(ConflictError);
  expect(
    await rejection(
      bob.mutateContactDetail({
        ...base,
        action: "updateAddress",
        id: crypto.randomUUID(),
        city: "Nowhere",
        isPrimary: true,
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(
      f.forActor(f.outsider, f.orgB).contacts.mutateContactDetail({
        ...base,
        organizationId: f.orgB,
        action: "addUrl",
        url: "https://foreign.example",
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
  expect(
    await rejection(
      bob.mutateContactDetail({ ...base, action: "addUrl", url: "https://inactive.example" }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  await f.forActor(f.alice).entities.softDelete(contact.entityId);
  expect(
    await rejection(
      f
        .forActor(f.alice)
        .contacts.mutateContactDetail({ ...base, action: "addUrl", url: "https://gone.example" }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  await f.db.update(actors).set({ disabledAt: null }).where(eq(actors.entityId, f.bob));
  await f.db
    .update(entities)
    .set({ deletedAt: null })
    .where(eq(entities.entityId, contact.entityId));
  expect(await f.forActor(f.alice).contacts.getDetail(contact.entityId)).toEqual(before);
  expect(await updates(contact.entityId)).toEqual(activityBefore);
});
