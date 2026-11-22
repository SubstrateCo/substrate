import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";

const f = setupDatabase();
const period = {
  organizationId: "org-a",
  from: "2026-11-01T00:00:00.000Z",
  until: "2026-12-01T00:00:00.000Z",
  timeZone: "UTC",
};

test("interaction directories and profiles use readable affiliations and do not duplicate explicit links", async () => {
  const owner = f.forActor(f.alice),
    member = f.forActor(f.bob);
  const account = await owner.crm.createAccount({ name: "Northstar" });
  const contact = await owner.contacts.create({ displayName: "Maya Chen" });
  await owner.crm.setAffiliation({
    accountEntityId: account.entityId,
    contactEntityId: contact.entityId,
    title: "Founder",
    isPrimary: true,
  });
  const interaction = await owner.contactInteractions.createManual({
    contactEntityId: contact.entityId,
    kind: "call",
    occurredAt: new Date("2026-11-10T12:00:00Z"),
    summary: "Pilot",
  });
  await owner.links.create({ entityId: interaction.entityId, otherEntityId: account.entityId });
  expect(
    (await owner.contactInteractions.workspaceDirectory({ ...period, type: "accounts" })).items,
  ).toMatchObject([{ name: "Northstar", count: 1, contacts: 1 }]);
  expect(
    (await member.contactInteractions.workspaceDirectory({ ...period, type: "people" })).items,
  ).toEqual([]);
  await owner.permissions.grant({
    entityId: contact.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(
    (await member.contactInteractions.workspaceDirectory({ ...period, type: "people" })).items,
  ).toMatchObject([{ name: "Maya Chen", count: 1 }]);
  expect(
    (await member.contactInteractions.workspaceDirectory({ ...period, type: "accounts" })).items,
  ).toEqual([]);
  expect(
    (await member.contactInteractions.workspaceProfile(contact.entityId, "person")).connections,
  ).toEqual([]);
  expect((await member.contactInteractions.workspaceRecord(interaction.entityId)).links).toEqual(
    [],
  );
  await rejection(
    member.contactInteractions.workspaceTimeline({ ...period, accountEntityId: account.entityId }),
  );
  await owner.crm.share(account.entityId, f.bob, "view");
  expect(
    (await member.contactInteractions.workspaceProfile(contact.entityId, "person")).connections,
  ).toMatchObject([{ entityId: account.entityId, title: "Northstar" }]);
  expect(
    (await member.contactInteractions.workspaceRecord(interaction.entityId)).links,
  ).toMatchObject([{ entityId: account.entityId, title: "Northstar" }]);
  expect(
    (
      await member.contactInteractions.workspaceTimeline({
        ...period,
        accountEntityId: account.entityId,
      })
    ).items,
  ).toHaveLength(1);
});

test("all-time timeline and repeat directory include older records but profile IDs cannot cross types or organizations", async () => {
  const repo = f.forActor(f.bob);
  const contact = await repo.contacts.create({ displayName: "Alex" });
  for (const occurredAt of ["2026-10-01T12:00:00Z", "2026-11-10T12:00:00Z"])
    await repo.contactInteractions.createManual({
      contactEntityId: contact.entityId,
      kind: "note",
      occurredAt: new Date(occurredAt),
      summary: "Context",
    });
  expect(
    (
      await repo.contactInteractions.workspaceDirectory({
        ...period,
        type: "people",
        repeat: "true",
      })
    ).items,
  ).toHaveLength(0);
  expect(
    (
      await repo.contactInteractions.workspaceDirectory({
        ...period,
        type: "people",
        repeat: "true",
        allTime: "true",
      })
    ).items,
  ).toMatchObject([{ count: 2 }]);
  expect(
    (
      await repo.contactInteractions.workspaceTimeline({
        ...period,
        allTime: "true",
        contactEntityId: contact.entityId,
      })
    ).items,
  ).toHaveLength(2);
  await rejection(repo.contactInteractions.workspaceProfile(contact.entityId, "account"));
  await rejection(
    f.forActor(f.outsider, f.orgB).contactInteractions.workspaceProfile(contact.entityId, "person"),
  );
});

test("directory pagination has a stable tie break and filters before paging", async () => {
  const repo = f.forActor(f.bob);
  for (const displayName of ["Alice", "Maya", "Zoe"]) {
    const contact = await repo.contacts.create({ displayName });
    await repo.contactInteractions.createManual({
      contactEntityId: contact.entityId,
      kind: "note",
      occurredAt: new Date("2026-11-10T12:00:00Z"),
      summary: "Context",
    });
  }
  const input = { ...period, type: "people" as const, pageSize: 2, sort: "name" as const };
  const first = await repo.contactInteractions.workspaceDirectory(input);
  expect(first.items.map((row) => row.name)).toEqual(["Alice", "Maya"]);
  expect(first.more).toBe(true);
  const next = await repo.contactInteractions.workspaceDirectory({ ...input, offset: 2 });
  expect(next.items.map((row) => row.name)).toEqual(["Zoe"]);
  expect(next.more).toBe(false);
  const filtered = await repo.contactInteractions.workspaceDirectory({ ...input, search: "Zoe" });
  expect(filtered.items.map((row) => row.name)).toEqual(["Zoe"]);
});
