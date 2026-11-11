import { taskStatusValues } from "@substrate/contracts/tasks";

import { AccessDeniedError } from "../errors";
import { createMessagingService } from "../features/messaging/service";
import * as schema from "../schema";
import { setupDatabase } from "../testing/database";
import { seedDevelopmentDatabase } from "./seed";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

describe("development seed", () => {
  const fixture = setupDatabase();

  test("creates usable teams, assigned projects, and shared conversations; reruns preserve edits without duplicating data or resetting passwords", async () => {
    expect(await seedDevelopmentDatabase(fixture.db, "development-password-hash")).toBe(true);
    for (const organizationId of ["dev-northstar", "dev-orbit"]) {
      const members = await fixture.db
        .select()
        .from(schema.member)
        .where(eq(schema.member.organizationId, organizationId));
      expect(members).toHaveLength(3);
      const actors = await fixture.db
        .select()
        .from(schema.actors)
        .where(eq(schema.actors.organizationId, organizationId));
      const assigned = new Set<string>();
      for (const actor of actors) {
        const repositories = fixture.forActor(actor.entityId, organizationId);
        const projects = await repositories.projects.list();
        expect(projects).toHaveLength(2);
        for (const project of projects) {
          const tasks = await repositories.tasks.list(project.entityId);
          expect(new Set(tasks.map((task) => task.status))).toEqual(new Set(taskStatusValues));
          expect(tasks.some((task) => task.assigneeActorEntityId === null)).toBe(true);
          for (const task of tasks) {
            if (task.assigneeActorEntityId) assigned.add(task.assigneeActorEntityId);
          }
        }
      }
      expect(assigned).toEqual(new Set(actors.map((actor) => actor.entityId)));
    }

    const alice = createMessagingService(fixture.db, {
      userId: "dev-alice",
      organizationId: "dev-northstar",
    });
    const dana = createMessagingService(fixture.db, {
      userId: "dev-dana",
      organizationId: "dev-orbit",
    });
    const shared = (await alice.listConversations()).find((row) => row.name === "Partner launch");
    expect(shared).toBeDefined();
    expect((await dana.listConversations()).some((row) => row.id === shared!.id)).toBe(true);
    const participants = await fixture.db
      .select({ organizationId: schema.messagingParticipants.organizationId })
      .from(schema.messagingParticipants)
      .where(eq(schema.messagingParticipants.conversationId, shared!.id));
    expect(new Set(participants.map((row) => row.organizationId))).toEqual(
      new Set(["dev-northstar", "dev-orbit"]),
    );
    const messages = await dana.listMessages(shared!.id);
    expect(shared!.partner).toBe(true);
    expect(
      (await alice.listConversations()).find((row) => row.name === "team-updates")!.partner,
    ).toBe(false);
    expect(messages.length).toBeGreaterThanOrEqual(3);
    const updates = (await alice.listConversations()).find((row) => row.name === "team-updates")!;
    const teamMessages = await alice.listMessages(updates.id);
    expect(teamMessages.length).toBeGreaterThanOrEqual(10);
    expect(teamMessages.some((message) => message.body.includes("@[task:"))).toBe(true);
    expect(teamMessages.some((message) => message.body.includes("@[person:"))).toBe(true);
    expect(teamMessages.filter((message) => message.replyCount > 0).length).toBeGreaterThanOrEqual(
      2,
    );
    expect((await fixture.db.select().from(schema.messageEntityReferences)).length).toBeGreaterThan(
      0,
    );
    const seededUsers = (await fixture.db.select().from(schema.user)).filter((person) =>
      person.id.startsWith("dev-"),
    );
    expect(new Set(seededUsers.map((person) => person.email.split("@")[1]))).toEqual(
      new Set(["northstar.test", "orbit.test"]),
    );
    const privateProjects = await fixture.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, "dev-northstar"));
    const [danaActor] = await fixture.db
      .select()
      .from(schema.actors)
      .where(eq(schema.actors.userId, "dev-dana"));
    expect(
      await fixture
        .forActor(danaActor!.entityId, "dev-orbit")
        .projects.get(privateProjects[0]!.entityId)
        .catch((error: Error) => error),
    ).toBeInstanceOf(AccessDeniedError);

    // A rerun preserves edits and does not duplicate data or reset passwords.
    const [task] = await fixture.db.select().from(schema.tasks);
    await fixture.db
      .update(schema.tasks)
      .set({ title: "My edited task" })
      .where(eq(schema.tasks.entityId, task!.entityId));
    const before = await fixture.db.select().from(schema.messagingMessages);
    expect(await seedDevelopmentDatabase(fixture.db, "replacement-hash")).toBe(false);
    expect(await fixture.db.select().from(schema.messagingMessages)).toEqual(before);
    expect(
      (
        await fixture.db
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.entityId, task!.entityId))
      )[0]!.title,
    ).toBe("My edited task");
    expect(
      (
        await fixture.db.select().from(schema.account).where(eq(schema.account.userId, "dev-alice"))
      )[0]!.password,
    ).toBe("development-password-hash");
    expect(
      (await fixture.db.select().from(schema.user).where(eq(schema.user.id, "alice")))[0]!.email,
    ).toBe("alice@example.com");
  });

  test("a conflicting existing account rolls back the whole seed", async () => {
    await fixture.db.insert(schema.user).values({
      id: "existing-user",
      name: "Existing",
      email: "bob@northstar.test",
    });
    expect(
      await seedDevelopmentDatabase(fixture.db, "hash").catch((error: Error) => error),
    ).toBeInstanceOf(Error);
    expect(
      await fixture.db
        .select()
        .from(schema.organization)
        .where(eq(schema.organization.id, "dev-northstar")),
    ).toHaveLength(0);
    expect(
      await fixture.db.select().from(schema.user).where(eq(schema.user.id, "dev-alice")),
    ).toHaveLength(0);
  });
});
