import { linkRepository } from "../core/links/repository";
import type { RepositoryContext } from "../core/repository-context";
import { contactApplicationRepository } from "../features/contacts/repository";
import { contextContactInteractionRepository } from "../features/context/contact-interactions";
import type { developmentTeams } from "./data";

type SeedContact = (typeof developmentTeams)[number]["contacts"][number];

export async function seedDevelopmentContact(
  context: RepositoryContext,
  input: SeedContact,
  projectName: string,
) {
  const contacts = contactApplicationRepository(context);
  const contact = await contacts.createContact({
    displayName: input.name,
    givenName: input.givenName,
    familyName: input.familyName,
    notes: input.notes,
  });
  for (const [type, value] of [
    ["email", input.email],
    ["phone", input.phone],
  ] as const) {
    await contacts.mutateContactDetail({
      action: "addIdentifier",
      organizationId: context.scope.organizationId,
      contactEntityId: contact.entityId,
      type,
      value,
      label: "Work",
      isPrimary: true,
    });
  }
  await contacts.mutateContactDetail({
    action: "addUrl",
    organizationId: context.scope.organizationId,
    contactEntityId: contact.entityId,
    url: input.website,
    label: "Company website",
    isPrimary: true,
  });
  const interactions = contextContactInteractionRepository(context);
  const history = [
    {
      kind: "email",
      daysAgo: 9,
      summary: `Shared the ${projectName} brief and agreed on the review milestones.`,
      minutes: 0,
    },
    {
      kind: "call",
      daysAgo: 6,
      summary: `Confirmed ${projectName} requirements with ${input.givenName}. The main flow is agreed; error recovery needs a follow-up.`,
      minutes: 20,
    },
    {
      kind: "meeting",
      daysAgo: 3,
      summary: `Walked through ${projectName} together. Agreed to keep the confirmation visible and review the remaining accessibility changes.`,
      minutes: 45,
    },
    {
      kind: "note",
      daysAgo: 1,
      summary: `${input.givenName} prefers one consolidated feedback update. Send the next review summary after the team walkthrough.`,
      minutes: 0,
    },
  ] as const;
  for (const entry of history) {
    const occurredAt = new Date();
    occurredAt.setUTCDate(occurredAt.getUTCDate() - entry.daysAgo);
    occurredAt.setUTCHours(14, 0, 0, 0);
    await interactions.createInteraction({
      contactEntityId: contact.entityId,
      kind: entry.kind,
      summary: entry.summary,
      occurredAt,
      endedAt: entry.minutes ? new Date(occurredAt.getTime() + entry.minutes * 60_000) : null,
    });
  }
  return contact;
}

export async function seedDevelopmentContactPublication(
  context: RepositoryContext,
  contactEntityId: string,
  taskEntityId: string,
  messageId: string,
  summary: string,
) {
  const interaction = await contextContactInteractionRepository(context).publishInteraction({
    contactEntityId,
    messageId,
    summary,
    kind: "message",
    occurredAt: new Date().toISOString(),
    consentToContactAudience: true,
  });
  await linkRepository(context).create({
    entityId: taskEntityId,
    otherEntityId: interaction.entityId,
  });
}
