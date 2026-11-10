import { taskStatusValues } from "@startup-os/contracts/tasks";

import type { DatabaseExecutor } from "../client";
import { ensureHumanActor } from "../core/actors/provisioning";
import { permissionRepository } from "../core/permissions/repository";
import { RepositoryContext } from "../core/repository-context";
import { createMessagingService } from "../features/messaging/service";
import { createSharingService } from "../features/messaging/sharing";
import { messagingInvitations } from "../features/messaging/sharing.schema";
import { projectRepository } from "../features/projects/repository";
import { taskRepository } from "../features/tasks/repository";
import { account, member, organization, user } from "../schema";
import { eq, inArray, sql } from "drizzle-orm";

export const developmentTeams = [
  {
    id: "dev-northstar",
    name: "Northstar Labs",
    slug: "dev-northstar",
    people: [
      { id: "dev-alice", name: "Alice Morgan", email: "alice@northstar.test", role: "owner" },
      { id: "dev-bob", name: "Bob Chen", email: "bob@northstar.test", role: "admin" },
      { id: "dev-carol", name: "Carol Rivera", email: "carol@northstar.test", role: "member" },
    ],
    projects: [
      { name: "Customer portal", description: "Ship a simpler onboarding and account experience." },
      { name: "Autumn launch", description: "Coordinate the product release with Orbit Studio." },
    ],
  },
  {
    id: "dev-orbit",
    name: "Orbit Studio",
    slug: "dev-orbit",
    people: [
      { id: "dev-dana", name: "Dana Patel", email: "dana@orbit.test", role: "owner" },
      { id: "dev-eli", name: "Eli Brooks", email: "eli@orbit.test", role: "admin" },
      { id: "dev-farah", name: "Farah Ahmed", email: "farah@orbit.test", role: "member" },
    ],
    projects: [
      { name: "Brand refresh", description: "Refresh the visual identity and marketing assets." },
      { name: "Partner campaign", description: "Prepare the joint Northstar launch campaign." },
    ],
  },
] as const;

// Trusted, development-only provisioning. One transaction makes reruns safe without resetting edits.
export async function seedDevelopmentDatabase(db: DatabaseExecutor, passwordHash: string) {
  return db.transaction(async (tx) => {
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
        actors.push(
          await ensureHumanActor(tx, {
            organizationId: team.id,
            userId: person.id,
            name: person.name,
          }),
        );
      }
      const context = new RepositoryContext(tx, {
        organizationId: team.id,
        actorEntityId: actors[0]!.entityId,
      });
      const seededTasks: { entityId: string; title: string }[] = [];
      for (const [projectIndex, input] of team.projects.entries()) {
        const project = await projectRepository(context).create(input);
        for (const actor of actors.slice(1)) {
          await permissionRepository(context).grant({
            entityId: project.entityId,
            actorEntityId: actor.entityId,
            level: "edit",
          });
        }
        const titles = [
          "Plan the next iteration",
          "Implement the first milestone",
          "Review the release assets",
          "Confirm project requirements",
          "Retire the old approach",
        ];
        const priorities = ["low", "high", "urgent", "medium", "none"] as const;
        for (const [index, status] of taskStatusValues.entries()) {
          const task = await taskRepository(context).create({
            projectEntityId: project.entityId,
            title: titles[index]!,
            status,
            description: `${input.name}: ${titles[index]!.toLowerCase()}. Coordinate with the project team and record the outcome here.`,
            priority: priorities[index],
            dueDate: date(index * 3 - 4),
            assigneeActorEntityId: actors[(index + projectIndex) % actors.length]!.entityId,
          });
          seededTasks.push(task);
          if (status === "in_progress") {
            await taskRepository(context).addComment(
              task.entityId,
              "The requirements are agreed. Please add your progress and any blockers here.",
            );
          }
        }
        await taskRepository(context).create({
          projectEntityId: project.entityId,
          title: "Triage follow-up feedback",
          description: "Pick an owner at the next team planning session.",
          status: "not_started",
        });
      }

      const messaging = (index: number) =>
        createMessagingService(tx, {
          userId: team.people[index]!.id,
          organizationId: team.id,
        });
      const channel = await messaging(0).createConversation({
        kind: "channel",
        name: "team-updates",
        emails: team.people.slice(1).map((person) => person.email),
      });
      const root = await messaging(0).sendMessage(
        channel.id,
        `Welcome to ${team.name}! Project boards are ready. Please review your assigned tasks before our planning session.`,
      );
      await messaging(1).sendMessage(
        channel.id,
        "I have started the implementation milestone and will post a progress update today.",
      );
      await messaging(2).sendMessage(
        channel.id,
        "Release assets are ready for review. Feedback is welcome.",
      );
      await messaging(1).sendMessage(channel.id, "The task assignments look good to me.", root.id);
      await messaging(2).toggleReaction(root.id, "👍");
      await messaging(1).toggleReaction(root.id, "🎉");
      await messaging(0).toggleReaction(root.id, "👍");
      const review = await messaging(1).sendMessage(
        channel.id,
        `@[person:${actors[2]!.entityId}] could you review @[task:${seededTasks[1]!.entityId}]? The first milestone is ready for a walkthrough.`,
      );
      await messaging(2).sendMessage(
        channel.id,
        "I tested the happy path. Two small changes: keep the confirmation visible and shorten the empty-state copy.",
        review.id,
      );
      await messaging(1).sendMessage(
        channel.id,
        "Both changes are in. I also checked the keyboard flow and the narrow layout.",
        review.id,
      );
      await messaging(0).sendMessage(
        channel.id,
        "Reviewed and approved. Let’s include this in the Friday demo.",
        review.id,
      );
      await messaging(2).toggleReaction(review.id, "👀");
      await messaging(0).toggleReaction(review.id, "✅");
      const planning = await messaging(2).sendMessage(
        channel.id,
        `Release checklist: @[task:${seededTasks[2]!.entityId}]. @[person:${actors[0]!.entityId}] can you confirm the final review slot?`,
      );
      await messaging(0).sendMessage(
        channel.id,
        "Thursday at 14:00 works. Please bring the latest screenshots and any open questions.",
        planning.id,
      );
      await messaging(1).sendMessage(
        channel.id,
        "I’ll bring the implementation notes and a short demo.",
        planning.id,
      );
      await messaging(0).toggleReaction(planning.id, "📌");
      const updates = [
        "Today’s focus: close the review feedback before starting new work. Flag blockers in a thread so we can help.",
        "Quick progress update: the core flow is complete. I’m checking edge cases and error recovery next.",
        "The updated assets are ready. I checked contrast, spacing, and the light and dark variants.",
        "Customer feedback: the simpler navigation is much easier to follow. Let’s keep the release scope focused.",
        "All review comments have owners now. No new blockers from me.",
        "Friday demo agenda: onboarding, project handoff, and partner launch readiness. Add questions below.",
        "Thanks everyone! The release checklist is looking good. We’ll make the final go/no-go decision after the demo.",
      ];
      for (const [index, body] of updates.entries()) {
        const message = await messaging(index % 3).sendMessage(channel.id, body);
        await messaging((index + 1) % 3).toggleReaction(message.id, ["🙌", "🚀", "✅"][index % 3]!);
      }
      const projectChannel = await messaging(0).createConversation({
        kind: "channel",
        name: team.id === "dev-northstar" ? "product-engineering" : "design-studio",
        emails: team.people.slice(1).map((person) => person.email),
      });
      for (const [index, task] of seededTasks.slice(0, 5).entries()) {
        const message = await messaging(index % 3).sendMessage(
          projectChannel.id,
          `Work update on @[task:${task.entityId}]: ${task.title}. Please keep review notes in this thread.`,
        );
        await messaging((index + 1) % 3).sendMessage(
          projectChannel.id,
          "I’ve checked the latest changes. The scope looks right; I’ll add my detailed notes after the walkthrough.",
          message.id,
        );
        await messaging((index + 2) % 3).toggleReaction(message.id, "👍");
      }
      const dm = await messaging(0).createConversation({
        kind: "dm",
        emails: [team.people[1].email],
      });
      await messaging(0).sendMessage(
        dm.id,
        "Can you review the high-priority task before tomorrow's sync?",
      );
      await messaging(1).sendMessage(
        dm.id,
        "Yes. I will add my notes to the project this afternoon.",
      );
    }

    const alice = createMessagingService(tx, {
      userId: "dev-alice",
      organizationId: "dev-northstar",
    });
    const dana = createMessagingService(tx, { userId: "dev-dana", organizationId: "dev-orbit" });
    const carol = createMessagingService(tx, {
      userId: "dev-carol",
      organizationId: "dev-northstar",
    });
    const farah = createMessagingService(tx, { userId: "dev-farah", organizationId: "dev-orbit" });
    const shared = await alice.createConversation({
      kind: "channel",
      name: "Partner launch",
      shareHistory: true,
      private: true,
      emails: [
        "bob@northstar.test",
        "carol@northstar.test",
        "dana@orbit.test",
        "eli@orbit.test",
        "farah@orbit.test",
      ],
    });
    const sharedInvites = await tx
      .select()
      .from(messagingInvitations)
      .where(eq(messagingInvitations.conversationId, shared.id));
    for (const invite of sharedInvites) {
      const person = developmentTeams[1].people.find((person) => person.email === invite.email);
      if (!person) throw new Error("Missing seed invitation recipient.");
      const accepted = await createSharingService(tx, {
        userId: person.id,
        organizationId: "dev-orbit",
      }).accept(invite.id, true);
      if (accepted.status === "approval-required")
        await createSharingService(tx, { userId: "dev-dana", organizationId: "dev-orbit" }).accept(
          invite.id,
          true,
        );
    }
    await alice.sendMessage(
      shared.id,
      "Welcome, Orbit team! Let's use this shared channel to coordinate the autumn launch.",
    );
    await dana.sendMessage(
      shared.id,
      "Thanks, Alice. Our brand refresh and campaign work are underway.",
    );
    const update = await carol.sendMessage(
      shared.id,
      "The draft release assets are ready. Can you review the campaign copy?",
    );
    await farah.sendMessage(
      shared.id,
      "I will review the copy today and share feedback here.",
      update.id,
    );
    await carol.sendMessage(
      shared.id,
      "I’ve incorporated the copy feedback. The final asset review is Thursday, with the joint demo on Friday.",
      update.id,
    );
    await dana.toggleReaction(update.id, "👀");
    await farah.toggleReaction(update.id, "✅");
    const launchPlan = await dana.sendMessage(
      shared.id,
      "Partner launch plan: Orbit owns the campaign creative; Northstar owns the product demo. Let’s use this thread for launch-day dependencies.",
    );
    await alice.sendMessage(
      shared.id,
      "Confirmed. Our demo environment will be ready by Thursday afternoon.",
      launchPlan.id,
    );
    await farah.sendMessage(
      shared.id,
      "Campaign creative is approved. I’ll share the final messaging checklist after the review.",
      launchPlan.id,
    );
    await carol.toggleReaction(launchPlan.id, "🚀");
    const partnerDm = await alice.createConversation({
      kind: "dm",
      emails: ["dana@orbit.test"],
      shareHistory: true,
    });
    const [dmInvite] = await tx
      .select()
      .from(messagingInvitations)
      .where(eq(messagingInvitations.conversationId, partnerDm.id));
    await createSharingService(tx, { userId: "dev-dana", organizationId: "dev-orbit" }).accept(
      dmInvite!.id,
      true,
    );
    await alice.sendMessage(
      partnerDm.id,
      "Are we still on for the partner launch review on Friday?",
    );
    await dana.sendMessage(partnerDm.id, "Confirmed. I will bring the latest campaign plan.");
    return true;
  });
}
