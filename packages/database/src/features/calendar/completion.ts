import { qualifyMeeting } from "@substrate/contracts/calendar/qualification";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { user } from "../../core/authentication/schema";
import { contactReadable } from "../../core/contacts/access";
import { normalizedIdentifier } from "../../core/contacts/inputs";
import { contactInteractions } from "../../core/contacts/interactions.schema";
import { contactIdentifiers, contacts } from "../../core/contacts/schema";
import { commit, type Committed } from "../../core/effects";
import { entities } from "../../core/entities/schema";
import type { DatabaseExecutor } from "../../core/executor";
import { relatedPair } from "../../core/links/repository";
import { entityLinks } from "../../core/links/schema";
import { member } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError, ValidationError } from "../../errors";
import { contactApplicationRepository } from "../contacts/repository";
import { recordCrmActivity } from "../crm/activity";
import { crmContactProfiles } from "../crm/schema";
import { completionGates, endedMeetingsQuery } from "./completion-queries";
import { contactNameFromAttendee, isGeneratedContactName } from "./contact-name";
import { calendarEventAttendees, calendarEvents, calendars } from "./schema";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

type Meeting = { organizationId: string; eventEntityId: string };
type Recorded = { interactionEntityIds: string[]; createdContactEntityIds: string[] };

const nothing = (): Recorded => ({ interactionEntityIds: [], createdContactEntityIds: [] });

/**
 * Ended meetings that may create interactions, across organizations. It takes no lease: a
 * concurrent recordMeetingInteractions for the same meeting changes nothing.
 */
export async function claimEndedMeetings(
  db: DatabaseExecutor,
  { limit, now = new Date() }: { limit: number; now?: Date },
): Promise<Meeting[]> {
  if (!Number.isInteger(limit) || limit < 1)
    throw new ValidationError("Limit must be a positive integer.");
  return endedMeetingsQuery(db, limit, now);
}

/**
 * Creates contacts and `meeting` interactions for the outside people in an ended meeting, as the
 * calendar owner. A meeting is processed once: the first run marks it, and later runs return
 * nothing. A meeting that fails a calendar gate stays unmarked, so it can qualify later.
 */
export function recordMeetingInteractions(
  db: DatabaseExecutor,
  { organizationId, eventEntityId, now = new Date() }: Meeting & { now?: Date },
): Promise<Committed<Recorded>> {
  return commit(db, async (tx) => {
    const [row] = await tx
      .select({
        event: calendarEvents,
        calendar: calendars,
        open: sql<boolean>`${completionGates()}`,
      })
      .from(calendarEvents)
      .innerJoin(
        calendars,
        and(
          eq(calendars.organizationId, calendarEvents.organizationId),
          eq(calendars.entityId, calendarEvents.calendarEntityId),
        ),
      )
      .where(
        and(
          eq(calendarEvents.organizationId, organizationId),
          eq(calendarEvents.entityId, eventEntityId),
        ),
      );
    if (!row || row.event.interactionsRecordedAt || !row.open) return nothing();
    const { event, calendar } = row;

    const attendees = await tx
      .select()
      .from(calendarEventAttendees)
      .where(
        and(
          eq(calendarEventAttendees.organizationId, organizationId),
          eq(calendarEventAttendees.eventEntityId, eventEntityId),
        ),
      )
      .orderBy(asc(calendarEventAttendees.normalizedEmail));
    const qualification = qualifyMeeting({ calendar, event, attendees, now });
    if (qualification.state === "upcoming") return nothing();
    if (
      qualification.state === "skipped" &&
      (qualification.reason === "interactions_off" ||
        qualification.reason === "before_interactions_from")
    )
      return nothing();

    const owner = await ownerContext(tx, calendar);
    if (!owner) return nothing();

    // Compare-and-set: of two concurrent runs, only the first marks the meeting and continues.
    // A failure later in this transaction rolls the mark back.
    const [marked] = await tx
      .update(calendarEvents)
      .set({ interactionsRecordedAt: now })
      .where(
        and(
          eq(calendarEvents.organizationId, organizationId),
          eq(calendarEvents.entityId, eventEntityId),
          isNull(calendarEvents.interactionsRecordedAt),
        ),
      )
      .returning({ entityId: calendarEvents.entityId });
    if (!marked || qualification.state === "skipped") return nothing();

    const people = await outsidePeople(owner, attendees);
    if (!people.length) return nothing();
    const { contactIds, created } = await resolveContacts(owner, people);
    if (!contactIds.length) return { interactionEntityIds: [], createdContactEntityIds: created };
    return {
      interactionEntityIds: await createInteractions(owner, event, contactIds),
      createdContactEntityIds: created,
    };
  });
}

// The owner's own scope, resolved the way a session is. Null when the owner can no longer act.
async function ownerContext(db: DatabaseExecutor, calendar: typeof calendars.$inferSelect) {
  try {
    const { context } = await workspaceContext(db, {
      userId: calendar.ownerUserId,
      organizationId: calendar.organizationId,
    });
    return context.scope.actorEntityId === calendar.ownerActorEntityId ? context : null;
  } catch (error) {
    if (error instanceof AccessDeniedError) return null;
    throw error;
  }
}

type Attendee = typeof calendarEventAttendees.$inferSelect;
type Person = { email: string; normalizedEmail: string; displayName: string | null };

// Attendees who are not the owner, a room, a decliner, or a verified member of the organization.
// A member match only skips the attendee; it never links the attendee to a user.
async function outsidePeople(ctx: RepositoryContext, attendees: Attendee[]): Promise<Person[]> {
  const candidates = attendees.flatMap((attendee) => {
    if (attendee.isSelf || attendee.isResource || attendee.responseStatus === "declined") return [];
    try {
      const { value, normalizedValue } = normalizedIdentifier({
        type: "email",
        value: attendee.email,
      });
      if (!normalizedValue) return [];
      return [
        { email: value, normalizedEmail: normalizedValue, displayName: attendee.displayName },
      ];
    } catch (error) {
      // An address that a contact cannot store is skipped.
      if (error instanceof ValidationError) return [];
      throw error;
    }
  });
  if (!candidates.length) return [];
  const emails = [...new Set(candidates.map((person) => person.email.toLowerCase()))];
  const members = await ctx.db
    .select({ email: sql<string>`lower(${user.email})` })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(
      and(
        eq(member.organizationId, ctx.scope.organizationId),
        eq(user.emailVerified, true),
        inArray(sql`lower(${user.email})`, emails),
      ),
    );
  const memberEmails = new Set(members.map((row) => row.email));
  const seen = new Set<string>();
  return candidates.filter((person) => {
    if (memberEmails.has(person.email.toLowerCase()) || seen.has(person.normalizedEmail))
      return false;
    seen.add(person.normalizedEmail);
    return true;
  });
}

// The oldest live contact with each email in the organization, or a new one. A person whose
// contact is archived in CRM is skipped, as publication refuses archived contacts.
async function resolveContacts(ctx: RepositoryContext, people: Person[]) {
  const matches = await ctx.db
    .select({
      normalizedEmail: contactIdentifiers.normalizedValue,
      email: contactIdentifiers.value,
      contactEntityId: contacts.entityId,
      contactName: contacts.displayName,
      archivedAt: crmContactProfiles.archivedAt,
    })
    .from(contactIdentifiers)
    .innerJoin(
      contacts,
      and(
        eq(contacts.organizationId, contactIdentifiers.organizationId),
        eq(contacts.entityId, contactIdentifiers.contactEntityId),
      ),
    )
    .innerJoin(
      entities,
      and(
        eq(entities.organizationId, contacts.organizationId),
        eq(entities.entityId, contacts.entityId),
        isNull(entities.deletedAt),
      ),
    )
    .leftJoin(
      crmContactProfiles,
      and(
        eq(crmContactProfiles.organizationId, contacts.organizationId),
        eq(crmContactProfiles.contactEntityId, contacts.entityId),
      ),
    )
    .where(
      and(
        eq(contactIdentifiers.organizationId, ctx.scope.organizationId),
        eq(contactIdentifiers.type, "email"),
        inArray(
          contactIdentifiers.normalizedValue,
          people.map((person) => person.normalizedEmail),
        ),
        contactReadable(ctx, contacts.entityId),
      ),
    )
    .orderBy(asc(entities.createdAt), asc(entities.entityId));
  const oldest = new Map<string, (typeof matches)[number]>();
  for (const match of matches)
    if (match.normalizedEmail && !oldest.has(match.normalizedEmail))
      oldest.set(match.normalizedEmail, match);

  const repository = contactApplicationRepository(ctx);
  const contactIds = new Set<string>();
  const created: string[] = [];
  for (const person of people) {
    const displayName = contactNameFromAttendee(person.email, person.displayName).slice(0, 1000);
    const match = oldest.get(person.normalizedEmail);
    if (match) {
      if (match.archivedAt) continue;
      contactIds.add(match.contactEntityId);
      // Only a name the calendar generated is replaced; a name a person typed is kept.
      if (
        displayName !== match.contactName &&
        [match.email, person.email].some((email) =>
          isGeneratedContactName(match.contactName, email),
        )
      )
        // The normal update path: it records CRM `updated` activity and the contact's hint.
        await repository.updateContact(match.contactEntityId, { displayName });
      continue;
    }
    // The normal creation path: it records CRM `created` activity and the contact's hint.
    const contact = await repository.createContact({ displayName });
    await repository.addIdentifier(contact.entityId, {
      type: "email",
      value: person.email,
      isPrimary: true,
    });
    created.push(contact.entityId);
    contactIds.add(contact.entityId);
  }
  return { contactIds: [...contactIds].sort(), created };
}

async function createInteractions(
  ctx: RepositoryContext,
  event: typeof calendarEvents.$inferSelect,
  contactIds: string[],
) {
  const { organizationId, actorEntityId } = ctx.scope;
  // Claims each contact's container version in ID order, as publication does, so concurrent
  // writers to the same contacts conflict instead of interleaving.
  const parents = await ctx.requireStructuralAccessAll(contactIds, "edit");
  const linked = await ctx.db
    .select({ contactEntityId: contactInteractions.contactEntityId })
    .from(contactInteractions)
    .innerJoin(
      entityLinks,
      and(
        eq(entityLinks.organizationId, contactInteractions.organizationId),
        eq(entityLinks.relationType, "related_to"),
        or(
          and(
            eq(entityLinks.sourceEntityId, contactInteractions.entityId),
            eq(entityLinks.targetEntityId, event.entityId),
          ),
          and(
            eq(entityLinks.sourceEntityId, event.entityId),
            eq(entityLinks.targetEntityId, contactInteractions.entityId),
          ),
        ),
      ),
    )
    .where(
      and(
        eq(contactInteractions.organizationId, organizationId),
        inArray(contactInteractions.contactEntityId, contactIds),
      ),
    );
  const done = new Set(linked.map((row) => row.contactEntityId));
  const summary = event.title.trim().slice(0, 10000) || "Meeting";
  const interactionIds: string[] = [];
  for (const parent of parents) {
    const contactEntityId = parent.entity.entityId;
    if (done.has(contactEntityId)) continue;
    const entity = await ctx.createChildEntity("contact_interaction", parent);
    await ctx.db.insert(contactInteractions).values({
      entityId: entity.entityId,
      organizationId,
      entityType: "contact_interaction",
      contactEntityId,
      kind: "meeting",
      occurredAt: event.startsAt,
      endedAt: event.endsAt,
      summary,
      origin: "calendar_event",
      createdByActorEntityId: actorEntityId,
    });
    await ctx.db.insert(entityLinks).values({
      organizationId,
      ...relatedPair(entity.entityId, event.entityId),
      relationType: "related_to",
      createdByActorEntityId: actorEntityId,
    });
    await ctx.touch(contactEntityId);
    await recordCrmActivity(
      ctx,
      {
        entityId: contactEntityId,
        action: "interaction_created",
        relatedEntityId: entity.entityId,
      },
      parent,
    );
    ctx.effects.hint({
      audience: realtimeKeys.entity(organizationId, contactEntityId),
      domain: "context",
    });
    interactionIds.push(entity.entityId);
  }
  return interactionIds;
}
