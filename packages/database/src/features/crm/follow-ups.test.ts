import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";

const f = setupDatabase();
test("follow-up reuses the task, preserves provenance and derives date-only next action", async () => {
  const a = f.forActor(f.alice);
  const project = await a.projects.create({ name: "Sales" });
  const contact = await a.contacts.create({ displayName: "Buyer" });
  const input = {
    entityId: contact.entityId,
    projectEntityId: project.entityId,
    requestId: crypto.randomUUID(),
    title: "Call buyer",
    dueDate: "2026-11-13",
    consentToTaskAudience: true as const,
  };
  const [first, replay] = await Promise.all([
    a.crm.createFollowUp(input),
    a.crm.createFollowUp(input),
  ]);
  expect(first.entityId).toBe(replay.entityId);
  expect((await a.crm.followUps(contact.entityId)).nextAction?.dueDate).toBe("2026-11-13");
  await a.tasks.update(first.entityId, { dueDate: "2026-11-12" }, project.entityId);
  expect((await a.crm.followUps(contact.entityId)).nextAction?.entityId).toBe(first.entityId);
  expect((await a.crm.followUps(contact.entityId)).nextAction?.dueDate).toBe("2026-11-12");
  expect((await f.forActor(f.bob).crm.followUps(contact.entityId)).tasks).toEqual([]);
  await a.tasks.update(first.entityId, { status: "completed" }, project.entityId);
  expect((await a.crm.followUps(contact.entityId)).nextAction).toBeNull();
  expect(await a.contactInteractions.listForContact(contact.entityId)).toEqual([]);
  expect(await rejection(a.crm.createFollowUp({ ...input, title: "Changed retry" }))).toMatchObject(
    { name: "ConflictError" },
  );
});

test("inaccessible project rejects the whole follow-up", async () => {
  const a = f.forActor(f.alice);
  const b = f.forActor(f.bob);
  const contact = await b.contacts.create({ displayName: "Buyer" });
  const project = await a.projects.create({ name: "Private sales" });
  expect(
    await rejection(
      b.crm.createFollowUp({
        entityId: contact.entityId,
        projectEntityId: project.entityId,
        requestId: crypto.randomUUID(),
        title: "Follow up",
        consentToTaskAudience: true,
      }),
    ),
  ).toMatchObject({ name: "AccessDeniedError" });
  expect((await b.crm.followUps(contact.entityId)).tasks).toEqual([]);
});
