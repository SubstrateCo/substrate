import { contactFields } from "@substrate/contracts/contacts/input";
import type { CrmFromMessageInput } from "@substrate/contracts/crm/from-message";
import { accountFields, dealFields, type CrmWrite } from "@substrate/contracts/crm/input";
import type { RecordActor } from "@substrate/contracts/crm/people";

import type { z } from "zod";

/** A workspace member from the organization people list. */
export type Member = { userId: string; name: string; email: string; image?: string | null };
/** A person who can be chosen for a CRM record. `id` is their actor ID. */
export type RecordPerson = { id: string; name: string; email: string };

/**
 * People to share a CRM record with or make responsible for it. Actors join members by user ID
 * only: never by email or actor ID. Agents and departed members are left out.
 */
export function recordPeople(
  actors: readonly RecordActor[],
  members: readonly Member[],
): RecordPerson[] {
  const byUser = new Map(members.map((member) => [member.userId, member]));
  return actors
    .flatMap((actor) => {
      const member = actor.type === "human" && actor.userId ? byUser.get(actor.userId) : undefined;
      return member ? [{ id: actor.entityId, name: member.name, email: member.email }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function personName(people: readonly RecordPerson[], actorEntityId: string) {
  return people.find((person) => person.id === actorEntityId)?.name ?? "Former member";
}

type Assignment = Extract<CrmWrite, { action: "assignOwner" }>;
export type ResponsibleRecord =
  | { kind: "account"; entityId: string; ownerActorEntityId: string }
  | { kind: "deal"; entityId: string; ownerActorEntityId: string; version: number };

/**
 * The reassignment write. It names the owner the reader saw, and a deal's version, so the server
 * rejects it if someone else changed the record first.
 */
export function ownerAssignment(
  organizationId: string,
  record: ResponsibleRecord,
  ownerActorEntityId: string,
  accessDecision: Assignment["accessDecision"],
): Assignment {
  const input: Assignment = {
    action: "assignOwner",
    organizationId,
    entityId: record.entityId,
    ownerActorEntityId,
    expectedOwnerActorEntityId: record.ownerActorEntityId,
    accessDecision,
  };
  if (record.kind === "deal") input.expectedVersion = record.version;
  return input;
}

/** Linked messages that can be a publication source: readable, not deleted, each once. */
export function publicationSources<T extends { messageId: string; deletedAt: string | null }>(
  rows: readonly T[],
): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (row.deletedAt || seen.has(row.messageId)) return false;
    seen.add(row.messageId);
    return true;
  });
}

export type MessageRecordDraft =
  | { kind: "account"; fields: z.input<typeof accountFields> }
  | { kind: "contact"; fields: z.input<typeof contactFields> }
  | { kind: "deal"; fields: z.input<typeof dealFields> };

/**
 * A CRM record created from a message. `consentToRecordAudience` must come from the reader's own
 * confirmation that the record's readers may see these fields. Only the kind's own fields are
 * sent, so form state cannot leak extra keys.
 */
export function messageRecordInput(
  organizationId: string,
  messageId: string,
  requestId: string,
  draft: MessageRecordDraft,
  consentToRecordAudience: true,
): CrmFromMessageInput {
  const source = {
    organizationId,
    messageId,
    requestId,
    consentToRecordAudience,
    associate: false,
  };
  switch (draft.kind) {
    case "account":
      return { ...source, kind: "account", fields: accountFields.parse(draft.fields) };
    case "contact":
      return { ...source, kind: "contact", fields: contactFields.parse(draft.fields) };
    case "deal":
      return { ...source, kind: "deal", fields: dealFields.parse(draft.fields) };
  }
}
