import { contextConversation } from "../../testing/context";
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
  expect((await member.contactInteractions.workspaceRecord(interaction.entityId)).links).toEqual([
    {
      entityId: account.entityId,
      entityType: "account",
      title: "Northstar",
      relation: "Related record",
      projectEntityId: null,
      contactEntityId: null,
    },
  ]);
  expect(
    (
      await member.contactInteractions.workspaceTimeline({
        ...period,
        accountEntityId: account.entityId,
      })
    ).items,
  ).toHaveLength(1);
});

test("linked interaction records retain parent IDs and link order without extra fields", async () => {
  const repo = f.forActor(f.alice);
  const contact = await repo.contacts.create({ displayName: "Buyer" });
  const interaction = await repo.contactInteractions.createManual({
    contactEntityId: contact.entityId,
    kind: "note",
    occurredAt: new Date("2026-11-10T12:00:00Z"),
    summary: "Original",
  });
  const other = await repo.contactInteractions.createManual({
    contactEntityId: contact.entityId,
    kind: "call",
    occurredAt: new Date("2026-11-11T12:00:00Z"),
    summary: "Follow-up",
  });
  const project = await repo.projects.create({ name: "Launch" });
  const task = await repo.tasks.create({ projectEntityId: project.entityId, title: "Ship" });
  await repo.links.create({ entityId: interaction.entityId, otherEntityId: task.entityId });
  await repo.links.create({ entityId: interaction.entityId, otherEntityId: other.entityId });
  const links = (await repo.contactInteractions.workspaceRecord(interaction.entityId)).links;
  expect(links.map((row) => row.entityId)).toEqual(
    (await repo.links.list(interaction.entityId)).map((row) =>
      row.sourceEntityId === interaction.entityId ? row.targetEntityId : row.sourceEntityId,
    ),
  );
  expect([...links].sort((a, b) => a.entityId.localeCompare(b.entityId))).toEqual(
    [
      {
        entityId: task.entityId,
        entityType: "task" as const,
        title: "Ship",
        relation: "Related record",
        projectEntityId: project.entityId,
        contactEntityId: null,
      },
      {
        entityId: other.entityId,
        entityType: "contact_interaction" as const,
        title: "Follow-up",
        relation: "Related record",
        projectEntityId: null,
        contactEntityId: contact.entityId,
      },
    ].sort((a, b) => a.entityId.localeCompare(b.entityId)),
  );
});

test("account interaction scope combines affiliations and links once and supports linked-only", async () => {
  const repo = f.forActor(f.alice);
  const account = await repo.crm.createAccount({ name: "Customer" });
  const affiliated = await repo.contacts.create({ displayName: "Buyer" });
  const other = await repo.contacts.create({ displayName: "Advisor" });
  await repo.crm.setAffiliation({
    accountEntityId: account.entityId,
    contactEntityId: affiliated.entityId,
    title: "Buyer",
    isPrimary: true,
  });
  const records = [];
  for (const contactEntityId of [
    affiliated.entityId,
    affiliated.entityId,
    other.entityId,
    other.entityId,
  ]) {
    records.push(
      await repo.contactInteractions.createManual({
        contactEntityId,
        kind: "note",
        occurredAt: new Date("2026-11-10T12:00:00Z"),
        summary: "Context",
      }),
    );
  }
  for (const record of [records[1]!, records[2]!])
    await repo.links.create({ entityId: record.entityId, otherEntityId: account.entityId });
  const expected = records
    .slice(0, 3)
    .map((row) => row.entityId)
    .sort();
  const input = { ...period, accountEntityId: account.entityId };
  expect(
    (await repo.contactInteractions.workspaceTimeline(input)).items
      .map((row) => row.entityId)
      .sort(),
  ).toEqual(expected);
  expect((await repo.crm.timeline(account.entityId)).map((row) => row.entityId).sort()).toEqual(
    expected,
  );
  const linked = records
    .slice(1, 3)
    .map((row) => row.entityId)
    .sort();
  expect(
    (await repo.contactInteractions.workspaceTimeline({ ...input, scope: "linked" })).items
      .map((row) => row.entityId)
      .sort(),
  ).toEqual(linked);
  expect(
    (await repo.crm.timeline(account.entityId, { mode: "linked" }))
      .map((row) => row.entityId)
      .sort(),
  ).toEqual(linked);
  expect(
    (await repo.contactInteractions.workspaceDirectory({ ...period, type: "accounts" })).items,
  ).toMatchObject([{ entityId: account.entityId, count: 3, contacts: 2 }]);
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

test("published interactions are counted and filtered by their origin", async () => {
  const { repos, reply } = await contextConversation(f);
  const contact = await repos.contacts.create({ displayName: "Maya Chen" });
  const occurredAt = "2026-11-12T12:00:00.000Z";
  const manual = await repos.contactInteractions.createManual({
    contactEntityId: contact.entityId,
    kind: "call",
    occurredAt: new Date(occurredAt),
    summary: "Manual call",
  });
  const published = await (
    await f.forSession("alice")
  ).contactInteractions.publishInteraction({
    contactEntityId: contact.entityId,
    kind: "message",
    summary: "Published summary",
    occurredAt,
    messageId: reply.id,
    consentToContactAudience: true,
  });
  expect((await repos.contactInteractions.workspaceActivity(period)).summary).toMatchObject({
    total: 2,
    published: 1,
  });
  const timeline = (origin: "manual" | "message_publication") =>
    repos.contactInteractions.workspaceTimeline({ ...period, origin });
  expect((await timeline("message_publication")).items.map((row) => row.entityId)).toEqual([
    published.result.entityId,
  ]);
  expect((await timeline("manual")).items.map((row) => row.entityId)).toEqual([manual.entityId]);
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
