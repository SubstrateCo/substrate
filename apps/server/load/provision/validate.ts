import type { FixtureCounts, LoadFixture } from "../types";
import {
  fixtureCounts,
  localTarget,
  requireNotificationMembers,
  SEED_PROFILE,
  SEED_VERSION,
} from "./fixture";
import { sizes } from "./organizations";
import { z } from "zod";

const id = z.string().min(1);
const entityId = z.uuid();
const count = z.number().int().nonnegative();
const schema = z.object({
  apiUrl: z.string(),
  origin: z.string(),
  password: z.string().min(1),
  seed: z.object({
    version: z.literal(SEED_VERSION),
    profile: z.literal(SEED_PROFILE),
    complete: z.literal(true),
    countBasis: z.literal("planned-minimum"),
    counts: z.object({
      users: count,
      organizations: count,
      channels: count,
      directMessages: count,
      groups: count,
      discussions: count,
      projects: count,
      tasks: count,
      messages: count,
      accounts: count,
      contacts: count,
      deals: count,
      followUps: count,
      notifications: count,
    }),
  }),
  organizations: z
    .array(
      z.object({
        id,
        slug: id,
        name: id,
        ownerEmail: z.email(),
        memberEmails: z.array(z.email()).min(1),
      }),
    )
    .length(8),
  users: z
    .array(
      z.object({
        email: z.email(),
        name: id,
        userId: id,
        organizationId: id,
        actorEntityId: entityId,
        notification: z.object({
          messageId: entityId,
          conversationId: entityId,
          senderUserId: id,
          senderActorEntityId: entityId,
        }),
        crm: z.object({
          accountEntityId: entityId,
          contactEntityId: entityId,
          dealEntityId: entityId,
          projectEntityId: entityId,
        }),
        workspace: z.object({
          conversationId: entityId,
          projectEntityId: entityId,
          taskEntityId: entityId,
          discussionId: entityId,
        }),
      }),
    )
    .min(8)
    .max(200),
});

export function validateFixture(
  value: LoadFixture,
  target: { apiUrl: string; origin: string },
): LoadFixture {
  const fixture = schema.parse(value);
  if (
    localTarget(fixture.apiUrl) !== localTarget(target.apiUrl) ||
    localTarget(fixture.origin) !== localTarget(target.origin)
  )
    throw new Error("Fixture target does not match the configured local target. Reset and reseed.");
  const expected = fixtureCounts(sizes(fixture.users.length));
  // SAFETY: expected is the complete FixtureCounts object returned by fixtureCounts.
  const countKeys = Object.keys(expected) as (keyof FixtureCounts)[];
  for (const key of countKeys) {
    if (fixture.seed.counts[key] !== expected[key])
      throw new Error(`Fixture count mismatch: ${key}`);
  }
  if (
    new Set(fixture.users.map((row) => row.email)).size !== fixture.users.length ||
    new Set(fixture.users.map((row) => row.userId)).size !== fixture.users.length ||
    new Set(fixture.organizations.map((row) => row.id)).size !== 8
  )
    throw new Error("Duplicate fixture identities.");
  if (new Set(fixture.users.map((row) => row.actorEntityId)).size !== fixture.users.length)
    throw new Error("Duplicate fixture actor identities.");
  const distribution = sizes(fixture.users.length);
  requireNotificationMembers(distribution);
  for (const [index, org] of fixture.organizations.entries()) {
    const members = fixture.users.filter((row) => row.organizationId === org.id);
    const sizeMismatch =
      members.length !== distribution[index] ||
      org.memberEmails.length !== members.length ||
      new Set(org.memberEmails).size !== members.length;
    if (
      sizeMismatch ||
      !org.memberEmails.includes(org.ownerEmail) ||
      members.some((row) => !org.memberEmails.includes(row.email))
    )
      throw new Error(`Fixture membership mismatch: ${org.slug}`);
  }
  for (const user of fixture.users) {
    if (user.workspace.projectEntityId !== user.crm.projectEntityId)
      throw new Error(`Fixture context mismatch: ${user.email}`);
    const sender = fixture.users.find((row) => row.userId === user.notification.senderUserId);
    const sameOrganization =
      sender?.organizationId === user.organizationId && sender.userId !== user.userId;
    if (
      !sameOrganization ||
      sender.actorEntityId !== user.notification.senderActorEntityId ||
      user.notification.conversationId !== user.workspace.conversationId
    )
      throw new Error(`Fixture notification source mismatch: ${user.email}`);
  }
  return fixture;
}
