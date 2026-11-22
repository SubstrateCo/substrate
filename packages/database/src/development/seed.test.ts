import { taskStatusValues } from "@substrate/contracts/tasks";

import { enabledApps } from "../core/apps/access";
import { RepositoryContext } from "../core/repository-context";
import { AccessDeniedError } from "../errors";
import { createMessagingService } from "../features/messaging/service";
import * as schema from "../schema";
import { setupDatabase } from "../testing/database";
import { seedDevelopmentDatabase } from "./seed";
import { describe, expect, test } from "bun:test";
import { and, eq, isNotNull, or } from "drizzle-orm";

describe("development seed", () => {
  const fixture = setupDatabase();

  test("enables the seeded Tasks app without enabling unrelated optional apps", async () => {
    await seedDevelopmentDatabase(fixture.db, "development-password-hash");
    for (const organizationId of ["dev-northstar", "dev-orbit"]) {
      const [owner] = await fixture.db
        .select()
        .from(schema.actors)
        .where(eq(schema.actors.organizationId, organizationId));
      const apps = await enabledApps(
        new RepositoryContext(fixture.db, {
          organizationId,
          actorEntityId: owner!.entityId,
        }),
      );
      expect(apps).toContain("tasks");
      expect(apps).not.toContain("crm");
    }
  });

  test("seeds connected work, task relationships, contact identifiers, and inactive local agent definitions", async () => {
    await seedDevelopmentDatabase(fixture.db, "development-password-hash");
    for (const organizationId of ["dev-northstar", "dev-orbit"]) {
      const tasks = await fixture.db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.organizationId, organizationId));
      const isTask = (entityId: string) => tasks.some((task) => task.entityId === entityId);
      const links = (
        await fixture.db
          .select()
          .from(schema.entityLinks)
          .where(eq(schema.entityLinks.organizationId, organizationId))
      ).filter((link) => isTask(link.sourceEntityId) && isTask(link.targetEntityId));
      expect(new Set(links.map((link) => link.relationType))).toEqual(
        new Set(["blocks", "duplicates", "related_to"]),
      );
      const children = tasks.filter((task) => task.parentTaskEntityId);
      expect(children).toHaveLength(4);
      const entities = await fixture.db
        .select()
        .from(schema.entities)
        .where(eq(schema.entities.organizationId, organizationId));
      for (const child of children) {
        const parent = tasks.find((task) => task.entityId === child.parentTaskEntityId)!;
        expect(child.projectEntityId).toBe(parent.projectEntityId);
        expect(entities.find((entity) => entity.entityId === child.entityId)!.accessEntityId).toBe(
          parent.projectEntityId,
        );
      }
      const references = await fixture.db
        .select({ entityType: schema.messageEntityReferences.entityType })
        .from(schema.messageEntityReferences)
        .innerJoin(
          schema.messagingMessages,
          eq(schema.messagingMessages.id, schema.messageEntityReferences.messageId),
        )
        .innerJoin(
          schema.messagingConversations,
          eq(schema.messagingConversations.id, schema.messagingMessages.conversationId),
        )
        .where(
          and(
            eq(schema.messagingConversations.organizationId, organizationId),
            isNotNull(schema.messagingConversations.taskEntityId),
          ),
        );
      expect(new Set(references.map((reference) => reference.entityType))).toEqual(
        new Set(["task", "project"]),
      );
      const notifications = await fixture.db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.organizationId, organizationId));
      expect(notifications.some((notification) => notification.kind === "mention")).toBe(true);
      const sources = await fixture.db
        .select()
        .from(schema.messageEntityReferences)
        .where(eq(schema.messageEntityReferences.organizationId, organizationId));
      expect(new Set(sources.map((source) => source.purpose))).toEqual(
        new Set(["source", "mention", "association"]),
      );
      const requests = await fixture.db
        .select()
        .from(schema.idempotentRequests)
        .where(
          and(
            eq(schema.idempotentRequests.organizationId, organizationId),
            eq(schema.idempotentRequests.operation, "task_from_message"),
          ),
        );
      expect(requests).toHaveLength(1);
      expect(
        sources.some(
          (source) => source.purpose === "source" && source.entityId === requests[0]!.entityId,
        ),
      ).toBe(true);
      const contacts = await fixture.db
        .select()
        .from(schema.contacts)
        .where(eq(schema.contacts.organizationId, organizationId));
      expect(contacts).toHaveLength(2);
      const identifiers = await fixture.db
        .select()
        .from(schema.contactIdentifiers)
        .where(eq(schema.contactIdentifiers.organizationId, organizationId));
      expect(new Set(identifiers.map((identifier) => identifier.contactEntityId))).toEqual(
        new Set(contacts.map((contact) => contact.entityId)),
      );
      const contextLinks = await fixture.db
        .select()
        .from(schema.entityLinks)
        .where(eq(schema.entityLinks.organizationId, organizationId));
      for (const contact of contacts) {
        expect(
          contextLinks.some(
            (link) =>
              (link.targetEntityId === contact.entityId && isTask(link.sourceEntityId)) ||
              (link.sourceEntityId === contact.entityId && isTask(link.targetEntityId)),
          ),
        ).toBe(true);
      }
    }
    const agents = await fixture.db.select().from(schema.userAgents);
    expect(agents).toHaveLength(6);
    for (const agent of agents) {
      expect(agent.enabled).toBe(false);
      expect(agent.homeDeviceId).toBeNull();
      expect(agent.userId.startsWith("dev-")).toBe(true);
    }
    expect(await fixture.db.select().from(schema.storedFiles)).toHaveLength(0);
    expect(await fixture.db.select().from(schema.agentWakes)).toHaveLength(0);
  });

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
    const workBefore = await fixture.db.select().from(schema.entityLinks);
    const agentsBefore = await fixture.db.select().from(schema.userAgents);
    const [interaction] = await fixture.db.select().from(schema.contactInteractions);
    await fixture.db
      .update(schema.contactInteractions)
      .set({ summary: "My edited call summary" })
      .where(eq(schema.contactInteractions.entityId, interaction!.entityId));
    const interactionsBefore = await fixture.db.select().from(schema.contactInteractions);
    await fixture.db
      .update(schema.organizationApps)
      .set({ enabled: false })
      .where(eq(schema.organizationApps.organizationId, "dev-northstar"));
    const appsBefore = await fixture.db.select().from(schema.organizationApps);
    expect(await seedDevelopmentDatabase(fixture.db, "replacement-hash")).toBe(false);
    expect(await fixture.db.select().from(schema.organizationApps)).toEqual(appsBefore);
    expect(await fixture.db.select().from(schema.messagingMessages)).toEqual(before);
    expect(await fixture.db.select().from(schema.entityLinks)).toEqual(workBefore);
    expect(await fixture.db.select().from(schema.userAgents)).toEqual(agentsBefore);
    expect(await fixture.db.select().from(schema.contactInteractions)).toEqual(interactionsBefore);
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

  test("seeds readable contact history, inherited access, and structured discussion and task context", async () => {
    await seedDevelopmentDatabase(fixture.db, "development-password-hash");
    for (const organizationId of ["dev-northstar", "dev-orbit"]) {
      const actors = await fixture.db
        .select()
        .from(schema.actors)
        .where(eq(schema.actors.organizationId, organizationId));
      for (const actor of actors) {
        const repos = fixture.forActor(actor.entityId, organizationId);
        const contacts = await repos.contacts.listContacts();
        expect(contacts).toHaveLength(2);
        for (const { contact } of contacts) {
          const detail = await repos.contacts.getContact(contact.entityId);
          expect(detail.profile.notes).toBeTruthy();
          expect(new Set(detail.identifiers.map((identifier) => identifier.type))).toEqual(
            new Set(["email", "phone"]),
          );
          expect(detail.urls).toHaveLength(1);
          const history = await repos.contactInteractions.listInteractions(contact.entityId);
          expect(new Set(history.map((interaction) => interaction.kind))).toEqual(
            new Set(["email", "meeting", "call", "note", "message"]),
          );
          expect(history).toHaveLength(5);
          for (const interaction of history) {
            const entity = await repos.entities.get(interaction.entityId);
            expect(entity.accessEntityId).toBe(contact.entityId);
          }
          const publication = history.find(
            (interaction) => interaction.origin === "message_publication",
          )!;
          const [source] = await fixture.db
            .select()
            .from(schema.messageEntityReferences)
            .where(
              and(
                eq(schema.messageEntityReferences.entityId, publication.entityId),
                eq(schema.messageEntityReferences.purpose, "source"),
              ),
            );
          expect(source?.organizationId).toBe(organizationId);
          const [taskLink] = await fixture.db
            .select()
            .from(schema.entityLinks)
            .where(
              or(
                eq(schema.entityLinks.targetEntityId, publication.entityId),
                eq(schema.entityLinks.sourceEntityId, publication.entityId),
              ),
            );
          expect(taskLink).toBeDefined();
          const taskId =
            taskLink!.sourceEntityId === publication.entityId
              ? taskLink!.targetEntityId
              : taskLink!.sourceEntityId;
          expect((await repos.entities.get(taskId)).entityType).toBe("task");
          expect(taskLink?.organizationId).toBe(organizationId);
        }
      }
    }
    const [foreignInteraction] = await fixture.db
      .select()
      .from(schema.contactInteractions)
      .where(eq(schema.contactInteractions.organizationId, "dev-orbit"));
    const [alice] = await fixture.db
      .select()
      .from(schema.actors)
      .where(eq(schema.actors.userId, "dev-alice"));
    expect(
      await fixture
        .forActor(alice!.entityId, "dev-northstar")
        .contactInteractions.get(foreignInteraction!.entityId)
        .catch((error: Error) => error),
    ).toBeInstanceOf(AccessDeniedError);
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
