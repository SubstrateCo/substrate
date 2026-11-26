import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("CRM context links check both ends, navigate in both directions, and never grant access", async () => {
  const a = f.forActor(f.alice);
  const b = f.forActor(f.bob);
  const source = await a.crm.createAccount({ name: "Source" });
  const target = await a.crm.createAccount({ name: "Restricted target" });
  await a.crm.share(source.entityId, f.bob, "edit");
  expect(
    await rejection(b.crm.changeRecordLink(source.entityId, target.entityId, false)),
  ).toMatchObject({ name: "AccessDeniedError" });
  await a.crm.changeRecordLink(source.entityId, target.entityId, false);
  expect(await b.crm.recordLinks(source.entityId)).toEqual([]);
  await a.crm.share(target.entityId, f.bob, "view");
  expect(await b.crm.recordLinks(source.entityId)).toMatchObject([
    { entityId: target.entityId, title: "Restricted target" },
  ]);
  expect(await b.crm.recordLinks(target.entityId)).toMatchObject([
    { entityId: source.entityId, title: "Source" },
  ]);
  expect(
    await rejection(b.crm.changeRecordLink(target.entityId, source.entityId, true)),
  ).toMatchObject({ name: "AccessDeniedError" });
  await a.crm.revoke(target.entityId, f.bob);
  expect(await b.crm.recordLinks(source.entityId)).toEqual([]);
  expect(
    await rejection(b.crm.changeRecordLink(source.entityId, target.entityId, true)),
  ).toMatchObject({ name: "AccessDeniedError" });
  await a.crm.share(target.entityId, f.bob, "view");
  await b.crm.changeRecordLink(source.entityId, target.entityId, true);
  expect(await a.crm.recordLinks(source.entityId)).toEqual([]);
  expect(await a.crm.recordLinks(target.entityId)).toEqual([]);
  expect((await b.crm.getAccount(target.entityId)).level).toBe("view");
});

test("CRM links reject foreign, unsupported, self and archived sources", async () => {
  const a = f.forActor(f.alice);
  const source = await a.crm.createAccount({ name: "Source" });
  const foreign = await f.forActor(f.outsider, f.orgB).crm.createAccount({ name: "Foreign" });
  expect(
    await rejection(a.crm.changeRecordLink(source.entityId, foreign.entityId, false)),
  ).toMatchObject({ name: "AccessDeniedError" });
  expect(await rejection(a.crm.changeRecordLink(source.entityId, f.alice, false))).toMatchObject({
    name: "AccessDeniedError",
  });
  expect(
    await rejection(a.crm.changeRecordLink(source.entityId, source.entityId, false)),
  ).toMatchObject({ name: "ValidationError" });
  const contact = await a.contacts.createContact({ displayName: "Contact" });
  await a.crm.archive(source.entityId, true);
  expect(
    await rejection(a.crm.changeRecordLink(source.entityId, contact.entityId, false)),
  ).toMatchObject({ name: "ValidationError" });
  expect(await a.crm.recordLinks(source.entityId)).toEqual([]);
});

test("work records can read CRM backlinks but cannot mutate through the CRM-only write surface", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Customer" });
  const project = await a.projects.create({ name: "Delivery" });
  await a.crm.changeRecordLink(account.entityId, project.entityId, false);
  expect(await a.crm.recordLinks(project.entityId)).toMatchObject([
    { entityId: account.entityId, entityType: "account", title: "Customer" },
  ]);
  expect(
    await rejection(a.crm.changeRecordLink(project.entityId, account.entityId, true)),
  ).toMatchObject({ name: "AccessDeniedError" });
});
