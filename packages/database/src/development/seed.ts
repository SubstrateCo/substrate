import type { DatabaseExecutor } from "../client";
import { ensureHumanActor } from "../core/actors/provisioning";
import { contactRepository } from "../core/contacts/repository";
import { commit } from "../core/effects";
import { linkRepository } from "../core/links/repository";
import { permissionRepository } from "../core/permissions/repository";
import { RepositoryContext } from "../core/repository-context";
import { createContextService } from "../features/context/service";
import { createMessagingService } from "../features/messaging/service";
import { messagingInvitations } from "../features/messaging/sharing.schema";
import { createSharingService } from "../features/messaging/sharing/service";
import { projectRepository } from "../features/projects/repository";
import { taskRepository } from "../features/tasks/repository";
import { account, contactIdentifiers, member, organization, user, userAgents } from "../schema";
import {
  developmentAgent,
  developmentConversations,
  developmentPartner,
  developmentTeams,
  developmentWork,
  type DevelopmentMessage,
} from "./data";
import { eq, inArray, sql } from "drizzle-orm";

export { developmentTeams } from "./data";

async function seedMessages(
  messaging: (author: number) => ReturnType<typeof createMessagingService>,
  conversationId: string,
  messages: readonly DevelopmentMessage[],
) {
  const ids = new Map<string, string>();
  for (const input of messages) {
    const parentId = input.replyTo ? ids.get(input.replyTo) : undefined;
    if (input.replyTo && !parentId) throw new Error(`Missing seed thread: ${input.replyTo}`);
    const message = await messaging(input.author).sendMessage(conversationId, input.body, parentId);
    ids.set(input.key, message.id);
    for (const reaction of input.reactions ?? []) {
      await messaging(reaction.author).toggleReaction(message.id, reaction.emoji);
    }
  }
  return ids;
}

// Trusted, development-only provisioning. One transaction makes reruns safe without resetting edits.
// Seeding publishes nothing: no client is connected to a new development database.
export async function seedDevelopmentDatabase(db: DatabaseExecutor, passwordHash: string) {
  const { result } = await commit(db, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(68520317)`);
    const existing = await tx
      .select()
      .from(organization)
      .where(
        inArray(
          organization.id,
          developmentTeams.map((team) => team.id),
        ),
      );
    if (existing.length === developmentTeams.length) return false;
    if (existing.length)
      throw new Error("Incomplete development seed: a reserved organization already exists.");

    const date = (offset: number) => {
      const value = new Date();
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0, 10);
    };
    for (const team of developmentTeams) {
      await tx.insert(organization).values({ id: team.id, name: team.name, slug: team.slug });
      const actors = [];
      for (const person of team.people) {
        await tx.insert(user).values({
          id: person.id,
          name: person.name,
          email: person.email,
          emailVerified: true,
          lastOrganizationId: team.id,
        });
        await tx.insert(account).values({
          id: `${person.id}-credential`,
          userId: person.id,
          accountId: person.id,
          providerId: "credential",
          password: passwordHash,
        });
        await tx.insert(member).values({
          id: `${person.id}-membership`,
          userId: person.id,
          organizationId: team.id,
          role: person.role,
        });
        actors.push(await ensureHumanActor(tx, { organizationId: team.id, userId: person.id }));
        await tx.insert(userAgents).values({
          ...developmentAgent,
          name: developmentAgent.name(person.name),
          userId: person.id,
        });
      }
      const context = new RepositoryContext(tx, {
        organizationId: team.id,
        actorEntityId: actors[0]!.entityId,
      });
      const messaging = (index: number) =>
        createMessagingService(tx, { userId: team.people[index]!.id, organizationId: team.id });
      const contacts = [];
      for (const input of team.contacts) {
        const contact = await contactRepository(context).create({ displayName: input.name });
        await tx.insert(contactIdentifiers).values({
          organizationId: team.id,
          contactEntityId: contact.entityId,
          type: "email",
          value: input.email,
        });
        for (const actor of actors.slice(1)) {
          await permissionRepository(context).grant({
            entityId: contact.entityId,
            actorEntityId: actor.entityId,
            level: "view",
          });
        }
        contacts.push(contact);
      }
      const seededTasks: { entityId: string; title: string; projectEntityId: string }[] = [];
      const tasks = taskRepository(context);
      for (const [projectIndex, input] of team.projects.entries()) {
        const project = await projectRepository(context).create({
          name: input.name,
          description: input.description,
        });
        for (const actor of actors.slice(1)) {
          await permissionRepository(context).grant({
            entityId: project.entityId,
            actorEntityId: actor.entityId,
            level: "edit",
          });
        }
        const projectTasks = [];
        for (const [index, stage] of developmentWork.stages.entries()) {
          const title = input.tasks[index]!;
          const task = await tasks.create({
            projectEntityId: project.entityId,
            title,
            status: stage.status,
            description: developmentWork.description(title),
            priority: stage.priority,
            dueDate: date(stage.dueInDays),
            assigneeActorEntityId: actors[(index + projectIndex) % actors.length]!.entityId,
          });
          seededTasks.push(task);
          projectTasks.push(task);
          if (stage.status === "in_progress")
            await messaging(0).sendMessage(
              await tasks.ensureDiscussion(task.entityId),
              developmentWork.progressComment,
            );
        }
        projectTasks.push(
          await tasks.create({ ...developmentWork.followup, projectEntityId: project.entityId }),
        );
        for (const link of developmentWork.links) {
          await tasks.addLink(
            projectTasks[link.source]!.entityId,
            link.relation,
            projectTasks[link.target]!.entityId,
          );
        }
        for (const [index, title] of input.subtasks.entries()) {
          const stage = developmentWork.subtasks[index]!;
          await tasks.create({
            projectEntityId: project.entityId,
            parentTaskEntityId: projectTasks[1]!.entityId,
            title,
            status: stage.status,
            priority: stage.priority,
            assigneeActorEntityId: actors[1]!.entityId,
            dueDate: date(stage.dueInDays),
          });
        }
        const discussionId = await tasks.ensureDiscussion(projectTasks[1]!.entityId);
        await messaging(0).sendMessage(
          discussionId,
          developmentWork.reviewComment(
            actors[1]!.entityId,
            projectTasks[0]!.entityId,
            project.entityId,
          ),
        );
        await messaging(1).sendMessage(discussionId, developmentWork.reviewerReply);
        await linkRepository(context).create({
          sourceEntityId: projectTasks[0]!.entityId,
          targetEntityId: contacts[projectIndex]!.entityId,
          relationType: "related_to",
        });
        if (projectIndex === 1) {
          const link = developmentWork.crossProjectLink;
          await tasks.addLink(
            seededTasks[link.source]!.entityId,
            link.relation,
            projectTasks[link.target]!.entityId,
          );
        }
      }

      const conversations = developmentConversations(team, actors, seededTasks);
      const channel = await messaging(0).createConversation({
        kind: "channel",
        name: conversations.updates.name,
        emails: team.people.slice(1).map((person) => person.email),
      });
      const messages = await seedMessages(messaging, channel.id, conversations.updates.messages);
      const workContext = createContextService(tx, {
        userId: team.people[0].id,
        organizationId: team.id,
      });
      const feedbackTask = await workContext.createTaskFromMessage({
        ...developmentWork.feedbackTask,
        requestId: crypto.randomUUID(),
        messageId: messages.get("feedback")!,
        projectEntityId: seededTasks[0]!.projectEntityId,
        assigneeActorEntityId: actors[1]!.entityId,
      });
      await workContext.attach(messages.get("review")!, feedbackTask.entityId);
      const projectChannel = await messaging(0).createConversation({
        kind: "channel",
        name: conversations.project.name,
        emails: team.people.slice(1).map((person) => person.email),
      });
      await seedMessages(messaging, projectChannel.id, conversations.project.messages);
      const dm = await messaging(0).createConversation({
        kind: "dm",
        emails: [team.people[1].email],
      });
      await seedMessages(messaging, dm.id, conversations.dm);
    }

    const [host, partner] = developmentTeams;
    const identities = [
      { userId: host.people[0].id, organizationId: host.id },
      { userId: partner.people[0].id, organizationId: partner.id },
      { userId: host.people[2].id, organizationId: host.id },
      { userId: partner.people[2].id, organizationId: partner.id },
    ];
    const messaging = (index: number) => createMessagingService(tx, identities[index]!);
    const shared = await messaging(0).createConversation({
      ...developmentPartner.channel,
      emails: [...host.people.slice(1), ...partner.people].map((person) => person.email),
    });
    const sharedInvites = await tx
      .select()
      .from(messagingInvitations)
      .where(eq(messagingInvitations.conversationId, shared.id));
    for (const invite of sharedInvites) {
      const person = partner.people.find((person) => person.email === invite.email);
      if (!person) throw new Error("Missing seed invitation recipient.");
      const accepted = await createSharingService(tx, {
        userId: person.id,
        organizationId: partner.id,
      }).accept(invite.id, true);
      if (accepted.status === "approval-required")
        await createSharingService(tx, identities[1]!).accept(invite.id, true);
    }
    await seedMessages(messaging, shared.id, developmentPartner.messages);
    const partnerDm = await messaging(0).createConversation({
      ...developmentPartner.dm,
      emails: [partner.people[0].email],
    });
    const [dmInvite] = await tx
      .select()
      .from(messagingInvitations)
      .where(eq(messagingInvitations.conversationId, partnerDm.id));
    await createSharingService(tx, identities[1]!).accept(dmInvite!.id, true);
    await seedMessages(messaging, partnerDm.id, developmentPartner.directMessages);
    return true;
  });
  return result;
}
