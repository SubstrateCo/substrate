import { setupDatabase } from "../../testing/database";
import { describe, expect, test } from "bun:test";

const f = setupDatabase();
const period = {
  organizationId: "org-a",
  from: "2026-11-01T00:00:00.000Z",
  until: "2026-12-01T00:00:00.000Z",
  timeZone: "America/New_York",
};

describe("interaction workspace", () => {
  test("includes the start boundary and counts only recorded meeting and call duration", async () => {
    const repo = f.forActor(f.bob);
    const contact = await repo.contacts.create({ displayName: "Boundary contact" });
    for (const occurredAt of [period.from, "2026-10-31T23:59:59.999Z", period.until]) {
      await repo.contactInteractions.createManual({
        contactEntityId: contact.entityId,
        kind: "meeting",
        occurredAt: new Date(occurredAt),
        summary: "Meeting without a recorded end",
      });
    }
    await repo.contactInteractions.createManual({
      contactEntityId: contact.entityId,
      kind: "note",
      occurredAt: new Date("2026-11-10T10:00:00Z"),
      endedAt: new Date("2026-11-10T11:00:00Z"),
      summary: "A note is not meeting time",
    });
    expect((await repo.contactInteractions.workspaceActivity(period)).summary).toEqual({
      total: 2,
      contacts: 1,
      meetingsAndCalls: 1,
      recordedMinutes: 0,
      published: 0,
    });
  });
  test("aggregates the organization's records only, excludes deleted records, and groups local days", async () => {
    const owner = f.forActor(f.alice);
    const member = f.forActor(f.bob);
    const visible = await member.contacts.create({ displayName: "Visible contact" });
    const ownerContact = await owner.contacts.create({ displayName: "Owner's contact" });
    const other = f.forActor(f.outsider, f.orgB);
    const foreign = await other.contacts.create({ displayName: "Other organization" });
    const create = (repo: typeof owner, contactEntityId: string, summary: string) =>
      repo.contactInteractions.createManual({
        contactEntityId,
        kind: "call",
        occurredAt: new Date("2026-11-10T01:00:00Z"),
        endedAt: new Date("2026-11-10T01:20:00Z"),
        summary,
      });
    await create(member, visible.entityId, "Visible");
    await create(owner, ownerContact.entityId, "Owner's");
    await create(other, foreign.entityId, "Foreign");
    const deleted = await create(member, visible.entityId, "Deleted interaction");
    await member.contactInteractions.softDelete(deleted.entityId);
    const deletedContact = await member.contacts.create({ displayName: "Deleted contact" });
    await create(member, deletedContact.entityId, "Deleted parent");
    await owner.entities.softDelete(deletedContact.entityId);
    await member.contactInteractions.createManual({
      contactEntityId: visible.entityId,
      kind: "email",
      occurredAt: new Date(period.until),
      summary: "Outside the half-open period",
    });
    const activity = await member.contactInteractions.workspaceActivity(period);
    expect(activity.summary).toEqual({
      total: 2,
      contacts: 2,
      meetingsAndCalls: 2,
      recordedMinutes: 40,
      published: 0,
    });
    expect(activity.activity).toEqual([{ day: "2026-11-09", kind: "call", count: 2 }]);
    expect(
      (await member.contactInteractions.workspaceTimeline(period)).items
        .map((r) => r.summary)
        .sort(),
    ).toEqual(["Owner's", "Visible"]);
    expect((await owner.contactInteractions.workspaceActivity(period)).summary.total).toBe(2);
  });

  test("filters the whole timeline and paginates equal times without duplicates", async () => {
    const repo = f.forActor(f.bob);
    const contact = await repo.contacts.create({ displayName: "Maya Chen" });
    for (let i = 0; i < 52; i++)
      await repo.contactInteractions.createManual({
        contactEntityId: contact.entityId,
        kind: i === 0 ? "email" : "meeting",
        occurredAt: new Date("2026-11-10T12:00:00Z"),
        summary: i === 0 ? "Proposal 100% ready" : `Pilot review ${i}`,
      });
    const first = await repo.contactInteractions.workspaceTimeline(period);
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
    const second = await repo.contactInteractions.workspaceTimeline({
      ...period,
      ...first.nextCursor!,
    });
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((r) => r.entityId)).size).toBe(52);
    const filtered = await repo.contactInteractions.workspaceTimeline({
      ...period,
      kind: "email",
      search: "100%",
      origin: "manual",
    });
    expect(filtered.items.map((r) => r.summary)).toEqual(["Proposal 100% ready"]);
    expect(
      (await repo.contactInteractions.workspaceTimeline({ ...period, search: "Maya" })).items,
    ).toHaveLength(50);
    expect(
      (await repo.contactInteractions.workspaceTimeline({ ...period, search: "100_" })).items,
    ).toHaveLength(0);
  });
});
