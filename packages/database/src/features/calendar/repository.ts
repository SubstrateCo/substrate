import {
  backfillPastDays,
  calendarProviders,
  gmailDuplicateWindowMs,
  initialSyncPastDays,
  type AttendeeResponseStatus,
  type AttendeeRole,
  type CalendarAccountView,
  type CalendarEventDetail,
  type CalendarEventSummary,
  type CalendarProvider,
  type CalendarSettingsView,
  type CalendarView,
  type InteractionSourceEvent,
  type MeetingOutcome,
  type ProviderCalendar,
} from "@substrate/contracts/calendar";
import type {
  CalendarEventRangeInput,
  CalendarUpdateInput,
} from "@substrate/contracts/calendar/input";
import { qualifyMeeting } from "@substrate/contracts/calendar/qualification";
import { hasGoogleProduct } from "@substrate/contracts/integrations/google";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { requireAppEnabled } from "../../core/apps/access";
import { account, user } from "../../core/authentication/schema";
import { contactReadable, interactionReadable } from "../../core/contacts/access";
import { contactInteractions } from "../../core/contacts/interactions/interactions.schema";
import { contactIdentifiers, contacts } from "../../core/contacts/schema";
import { entities } from "../../core/entities/schema";
import { relatedLink } from "../../core/links/repository";
import { entityLinks } from "../../core/links/schema";
import { member } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ConflictError, mapPostgresError, ValidationError } from "../../errors";
import { calendarEventAttendees, calendarEvents, calendars } from "./schema";
import { normalizeAttendeeEmail } from "./sync";
import { effectiveSyncStatus, presentCalendar, presentEventSummary } from "./views";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

const counterparts = alias(calendarEvents, "counterpart_events");
const counterpartCalendars = alias(calendars, "counterpart_calendars");

type CalendarRow = typeof calendars.$inferSelect;
type CalendarChange = Partial<typeof calendars.$inferInsert>;

const dayMs = 86_400_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clearedLease = { syncLeaseToken: null, syncLeaseExpiresAt: null } as const;

function hasCalendarScope(provider: CalendarProvider, scope: string | null) {
  if (provider === "google") return hasGoogleProduct(scope, "calendar");
  const scopes = (scope ?? "").split(/[\s,]+/);
  return scopes.some((value) => value === "Calendars.Read" || value.endsWith("/Calendars.Read"));
}

// The email claim of an ID token. The token came from the provider through better-auth; it is
// read for display only, so its signature is not checked here.
const idTokenClaims = z.object({ email: z.string().min(1) });
function idTokenEmail(idToken: string | null) {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  return idTokenClaims.safeParse(claims).data?.email ?? null;
}

function calendarName(calendar: ProviderCalendar) {
  return (calendar.name.trim() || calendar.providerCalendarId).slice(0, 500);
}

// People only: rooms and other resources are not counted.
function attendeeCount() {
  return sql<number>`(SELECT count(*)::int FROM ${calendarEventAttendees}
    WHERE ${calendarEventAttendees.organizationId} = ${calendarEvents.organizationId}
      AND ${calendarEventAttendees.eventEntityId} = ${calendarEvents.entityId}
      AND NOT ${calendarEventAttendees.isResource})`;
}

// The owner's response, or NULL when the owner is not listed.
function selfResponseStatus() {
  return sql<AttendeeResponseStatus | null>`(SELECT ${calendarEventAttendees.responseStatus}
    FROM ${calendarEventAttendees}
    WHERE ${calendarEventAttendees.organizationId} = ${calendarEvents.organizationId}
      AND ${calendarEventAttendees.eventEntityId} = ${calendarEvents.entityId}
      AND ${calendarEventAttendees.isSelf}
    ORDER BY ${calendarEventAttendees.normalizedEmail}
    LIMIT 1)`;
}

export function calendarRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const org = scope.organizationId;

  function changed(ctx: RepositoryContext, calendarEntityId: string) {
    ctx.effects.hint({ audience: realtimeKeys.entity(org, calendarEntityId), domain: "context" });
  }

  // Calendars and their credentials are managed by their owner in person, not by agents.
  async function requireOwner(ctx: RepositoryContext) {
    const { userId, actorEntityId } = ctx.scope;
    if (!userId) throw new AccessDeniedError();
    const [owner] = await ctx.db
      .select({ actorEntityId: actors.entityId })
      .from(actors)
      .innerJoin(
        entities,
        and(
          eq(entities.organizationId, actors.organizationId),
          eq(entities.entityId, actors.entityId),
          isNull(entities.deletedAt),
        ),
      )
      .where(
        and(
          eq(actors.organizationId, org),
          eq(actors.entityId, actorEntityId),
          eq(actors.userId, userId),
          eq(actors.type, "human"),
          activeActorCondition(),
        ),
      );
    if (!owner) throw new AccessDeniedError();
    return { userId, actorEntityId: owner.actorEntityId };
  }

  async function requireCalendar(ctx: RepositoryContext, calendarEntityId: string) {
    await requireAppEnabled(ctx, "calendar");
    await requireOwner(ctx);
    await ctx.requireAccess(calendarEntityId, "owner");
    const [row] = await ctx.db
      .select()
      .from(calendars)
      .where(and(eq(calendars.organizationId, org), eq(calendars.entityId, calendarEntityId)));
    if (!row) throw new AccessDeniedError();
    return row;
  }

  // Compare-and-set on the status that the change was decided from.
  async function changeCalendar(
    ctx: RepositoryContext,
    calendar: CalendarRow,
    change: CalendarChange,
  ) {
    if (!Object.keys(change).length) return presentCalendar(calendar);
    const [row] = await ctx.db
      .update(calendars)
      .set(change)
      .where(
        and(
          eq(calendars.organizationId, org),
          eq(calendars.entityId, calendar.entityId),
          eq(calendars.syncStatus, calendar.syncStatus),
        ),
      )
      .returning();
    if (!row) throw new ConflictError("This calendar changed. Try again.");
    changed(ctx, row.entityId);
    return presentCalendar(row);
  }

  // A Gmail event is a copy when its owner has another readable event starting near it, on any
  // of their calendars here. Each of the owner's calendars is a range read on the agenda index.
  function notGmailDuplicate() {
    const window = sql.raw(`interval '${gmailDuplicateWindowMs} milliseconds'`);
    return or(
      ne(calendarEvents.kind, "from_gmail"),
      notExists(
        db
          .select({ one: sql`1` })
          .from(counterpartCalendars)
          .innerJoin(
            counterparts,
            and(
              eq(counterparts.organizationId, counterpartCalendars.organizationId),
              eq(counterparts.calendarEntityId, counterpartCalendars.entityId),
            ),
          )
          .where(
            and(
              eq(counterpartCalendars.organizationId, calendars.organizationId),
              eq(counterpartCalendars.ownerActorEntityId, calendars.ownerActorEntityId),
              gte(counterparts.startsAt, sql`${calendarEvents.startsAt} - ${window}`),
              lte(counterparts.startsAt, sql`${calendarEvents.startsAt} + ${window}`),
              eq(counterparts.allDay, calendarEvents.allDay),
              ne(counterparts.kind, "from_gmail"),
              ne(counterparts.status, "cancelled"),
              context.readable(counterparts.entityId),
            ),
          ),
      ),
    );
  }

  async function summaries(where: SQL | undefined, order: SQL[], limit?: number) {
    await context.requireActiveActor();
    const query = db
      .select({
        event: calendarEvents,
        calendar: { name: calendars.name, color: calendars.color },
        attendeeCount: attendeeCount(),
        selfResponseStatus: selfResponseStatus(),
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
          eq(calendarEvents.organizationId, org),
          ne(calendarEvents.status, "cancelled"),
          context.readable(calendarEvents.entityId),
          notGmailDuplicate(),
          where,
        ),
      )
      .orderBy(...order);
    const rows = await (limit === undefined ? query : query.limit(limit));
    return rows.map((row): CalendarEventSummary =>
      presentEventSummary(row.event, row.calendar, row.attendeeCount, row.selfResponseStatus),
    );
  }

  return {
    async settings(): Promise<Omit<CalendarSettingsView, "providers">> {
      await requireAppEnabled(context, "calendar");
      const owner = await requireOwner(context);
      const linked = await db
        .select({
          id: account.id,
          providerId: account.providerId,
          scope: account.scope,
          idToken: account.idToken,
        })
        .from(account)
        .where(
          and(eq(account.userId, owner.userId), inArray(account.providerId, calendarProviders)),
        )
        .orderBy(asc(account.createdAt), asc(account.id));
      const owned = await db
        .select({ calendar: calendars })
        .from(calendars)
        .innerJoin(
          entities,
          and(
            eq(entities.organizationId, calendars.organizationId),
            eq(entities.entityId, calendars.entityId),
            isNull(entities.deletedAt),
          ),
        )
        .where(
          and(
            eq(calendars.organizationId, org),
            eq(calendars.ownerActorEntityId, owner.actorEntityId),
          ),
        )
        .orderBy(desc(calendars.isPrimary), asc(calendars.name), asc(calendars.entityId));
      const rows = owned.map((row) => row.calendar);
      const accounts = linked.flatMap((linkedAccount): CalendarAccountView[] => {
        const provider = calendarProviders.find((value) => value === linkedAccount.providerId);
        if (!provider) return [];
        const connected = rows.filter((row) => row.credentialAccountId === linkedAccount.id);
        return [
          {
            credentialAccountId: linkedAccount.id,
            provider,
            email:
              idTokenEmail(linkedAccount.idToken) ??
              connected.find((row) => row.isPrimary)?.providerCalendarId ??
              null,
            hasCalendarAccess: hasCalendarScope(provider, linkedAccount.scope),
            calendars: connected.map(presentCalendar),
          },
        ];
      });
      return {
        accounts,
        detachedCalendars: rows.filter((row) => !row.credentialAccountId).map(presentCalendar),
      };
    },

    connect(input: { credentialAccountId: string; calendars: ProviderCalendar[] }) {
      return context.transaction(async (ctx): Promise<CalendarView[]> => {
        await requireAppEnabled(ctx, "calendar");
        const owner = await requireOwner(ctx);
        const [linked] = await ctx.db
          .select({ providerId: account.providerId })
          .from(account)
          .where(and(eq(account.id, input.credentialAccountId), eq(account.userId, owner.userId)));
        if (!linked) throw new AccessDeniedError();
        const provider = calendarProviders.find((value) => value === linked.providerId);
        if (!provider) throw new ValidationError("This account has no calendars to connect.");
        const offered = new Map(input.calendars.map((value) => [value.providerCalendarId, value]));
        if (!offered.size) throw new ValidationError("Choose at least one calendar.");
        const existing = new Map(
          (
            await ctx.db
              .select()
              .from(calendars)
              .where(
                and(
                  eq(calendars.organizationId, org),
                  eq(calendars.ownerActorEntityId, owner.actorEntityId),
                  eq(calendars.provider, provider),
                  inArray(calendars.providerCalendarId, [...offered.keys()]),
                ),
              )
          ).map((row) => [row.providerCalendarId, row]),
        );
        const now = new Date();
        const views: CalendarView[] = [];
        for (const offer of offered.values()) {
          const details = {
            name: calendarName(offer),
            color: offer.color,
            timeZone: offer.timeZone,
            isPrimary: offer.isPrimary,
            credentialAccountId: input.credentialAccountId,
          };
          const current = existing.get(offer.providerCalendarId);
          if (current) {
            // A calendar that stopped syncing for want of a credential starts over with this one.
            const change: CalendarChange = { ...details };
            const status = effectiveSyncStatus(current);
            if (status === "disconnected" || status === "reauth_required")
              Object.assign(change, {
                ...clearedLease,
                syncStatus: "pending",
                syncCursor: null,
                syncErrorCode: null,
                nextSyncAt: now,
              });
            views.push(await changeCalendar(ctx, current, change));
            continue;
          }
          const entity = await ctx.createEntity("calendar");
          const [row] = await ctx.db
            .insert(calendars)
            .values({
              entityId: entity.entityId,
              organizationId: org,
              entityType: "calendar",
              ownerActorEntityId: owner.actorEntityId,
              ownerUserId: owner.userId,
              provider,
              providerCalendarId: offer.providerCalendarId,
              ...details,
              recordsInteractions: true,
              interactionsFrom: now,
              syncWindowStart: new Date(now.getTime() - initialSyncPastDays * dayMs),
              syncStatus: "pending",
              nextSyncAt: now,
            })
            .returning()
            .catch((error: Error) =>
              mapPostgresError(error, {
                uniqueConstraint: {
                  calendars_owner_calendar_unique: "This calendar was just connected. Try again.",
                },
              }),
            );
          changed(ctx, row!.entityId);
          views.push(presentCalendar(row!));
        }
        return views;
      });
    },

    update(input: Omit<CalendarUpdateInput, "organizationId">) {
      return context.transaction(async (ctx) => {
        const calendar = await requireCalendar(ctx, input.calendarEntityId);
        const change: CalendarChange = {};
        if (input.recordsInteractions !== undefined)
          change.recordsInteractions = input.recordsInteractions;
        if (input.paused !== undefined && effectiveSyncStatus(calendar) === "disconnected")
          throw new ValidationError("Reconnect the calendar first.");
        if (input.paused === true)
          Object.assign(change, { ...clearedLease, syncStatus: "paused", nextSyncAt: null });
        if (input.paused === false && calendar.syncStatus === "paused")
          Object.assign(change, { syncStatus: "pending", nextSyncAt: new Date() });
        return changeCalendar(ctx, calendar, change);
      });
    },

    disconnect(input: { calendarEntityId: string }) {
      return context.transaction(async (ctx) => {
        const calendar = await requireCalendar(ctx, input.calendarEntityId);
        // The credential and the events stay, so reconnecting resumes the calendar's history.
        return changeCalendar(ctx, calendar, {
          ...clearedLease,
          syncStatus: "disconnected",
          syncCursor: null,
          nextSyncAt: null,
        });
      });
    },

    backfill(input: { calendarEntityId: string }) {
      return context.transaction(async (ctx) => {
        const calendar = await requireCalendar(ctx, input.calendarEntityId);
        const status = effectiveSyncStatus(calendar);
        if (status === "paused" || status === "disconnected")
          throw new ValidationError("Resume the calendar first.");
        const now = new Date();
        const floor = new Date(now.getTime() - backfillPastDays * dayMs);
        const earlier = (value: Date) => (value < floor ? value : floor);
        // Clearing the lease makes a running sync's commit fail, so it cannot store the cursor
        // that this full sync replaces.
        return changeCalendar(ctx, calendar, {
          ...clearedLease,
          interactionsFrom: earlier(calendar.interactionsFrom),
          syncWindowStart: earlier(calendar.syncWindowStart),
          syncCursor: null,
          syncStatus: "pending",
          nextSyncAt: now,
        });
      });
    },

    async events(input: Omit<CalendarEventRangeInput, "organizationId">) {
      const from = new Date(input.from);
      const until = new Date(input.until);
      if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime()) || until <= from)
        throw new ValidationError("Choose a valid period.");
      const ids = input.calendarEntityIds;
      if (ids && !ids.length) return [];
      if (ids?.some((id) => !uuidPattern.test(id)))
        throw new ValidationError("Invalid calendar ID.");
      return summaries(
        and(
          ids ? inArray(calendarEvents.calendarEntityId, ids) : undefined,
          lt(calendarEvents.startsAt, until),
          // An event of zero length at the start of the period still overlaps it.
          or(gt(calendarEvents.endsAt, from), gte(calendarEvents.startsAt, from)),
        ),
        [asc(calendarEvents.startsAt), asc(calendarEvents.entityId)],
      );
    },

    async event(entityId: string): Promise<CalendarEventDetail> {
      await context.requireAccess(entityId, "view");
      const [row] = await db
        .select({ event: calendarEvents, calendar: calendars, attendeeCount: attendeeCount() })
        .from(calendarEvents)
        .innerJoin(
          calendars,
          and(
            eq(calendars.organizationId, calendarEvents.organizationId),
            eq(calendars.entityId, calendarEvents.calendarEntityId),
          ),
        )
        .where(and(eq(calendarEvents.organizationId, org), eq(calendarEvents.entityId, entityId)));
      if (!row) throw new AccessDeniedError();
      const attendees = await db
        .select()
        .from(calendarEventAttendees)
        .where(
          and(
            eq(calendarEventAttendees.organizationId, org),
            eq(calendarEventAttendees.eventEntityId, entityId),
          ),
        )
        .orderBy(
          desc(calendarEventAttendees.isOrganizer),
          asc(calendarEventAttendees.normalizedEmail),
        );
      const emails = attendees.map((attendee) => attendee.normalizedEmail);
      const memberEmail = sql<string>`lower(${user.email})`;
      const members = new Set(
        emails.length
          ? (
              await db
                .selectDistinct({ email: memberEmail })
                .from(user)
                .innerJoin(member, eq(member.userId, user.id))
                .where(
                  and(
                    eq(member.organizationId, org),
                    eq(user.emailVerified, true),
                    inArray(memberEmail, emails),
                  ),
                )
            ).map((value) => value.email)
          : [],
      );
      const contactEmail = sql<string>`lower(${contactIdentifiers.normalizedValue})`;
      const matches = new Map<string, { entityId: string; displayName: string }>();
      if (emails.length) {
        const rows = await db
          .select({
            email: contactEmail,
            entityId: contacts.entityId,
            displayName: contacts.displayName,
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
            ),
          )
          .where(
            and(
              eq(contactIdentifiers.organizationId, org),
              eq(contactIdentifiers.type, "email"),
              inArray(contactEmail, emails),
              contactReadable(context, contacts.entityId),
            ),
          )
          // The oldest contact wins when several share an email.
          .orderBy(asc(entities.createdAt), asc(entities.entityId));
        for (const match of rows)
          if (!matches.has(match.email))
            matches.set(match.email, { entityId: match.entityId, displayName: match.displayName });
      }
      const role = (attendee: (typeof attendees)[number]): AttendeeRole => {
        if (attendee.isSelf) return "self";
        if (attendee.isResource) return "resource";
        if (members.has(attendee.normalizedEmail)) return "member";
        if (attendee.responseStatus === "declined") return "declined";
        if (matches.has(attendee.normalizedEmail)) return "contact";
        return "new_contact";
      };

      const interactions = await db
        .select({
          entityId: contactInteractions.entityId,
          contactEntityId: contactInteractions.contactEntityId,
          contactName: contacts.displayName,
        })
        .from(contactInteractions)
        .innerJoin(
          entityLinks,
          and(
            eq(entityLinks.organizationId, contactInteractions.organizationId),
            relatedLink(entityId, contactInteractions.entityId),
          ),
        )
        .innerJoin(
          contacts,
          and(
            eq(contacts.organizationId, contactInteractions.organizationId),
            eq(contacts.entityId, contactInteractions.contactEntityId),
          ),
        )
        .where(
          and(
            eq(contactInteractions.organizationId, org),
            interactionReadable(context, contactInteractions.entityId),
          ),
        )
        .orderBy(asc(contacts.displayName), asc(contactInteractions.entityId));

      const { event, calendar } = row;
      const qualification = qualifyMeeting({
        calendar,
        event,
        attendees,
        now: new Date(),
      });
      let outcome: MeetingOutcome;
      if (qualification.state === "skipped") outcome = qualification;
      else if (event.interactionsRecordedAt)
        outcome = interactions.length
          ? { state: "recorded" }
          : { state: "skipped", reason: "no_external_attendees" };
      else
        outcome = qualification.state === "eligible" ? { state: "pending" } : { state: "upcoming" };

      return {
        ...presentEventSummary(
          event,
          calendar,
          row.attendeeCount,
          attendees.find((attendee) => attendee.isSelf)?.responseStatus ?? null,
        ),
        description: event.description,
        htmlLink: event.htmlLink,
        visibility: event.visibility,
        timeZone: event.timeZone,
        provider: calendar.provider,
        attendees: attendees.map((attendee) => ({
          email: attendee.email,
          displayName: attendee.displayName,
          responseStatus: attendee.responseStatus,
          isOrganizer: attendee.isOrganizer,
          isOptional: attendee.isOptional,
          role: role(attendee),
          contact: matches.get(attendee.normalizedEmail) ?? null,
        })),
        outcome,
        interactions,
      };
    },

    async contactMeetings(input: { contactEntityId: string; limit?: number }) {
      const limit = input.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        throw new ValidationError("Limit must be an integer from 1 to 50.");
      const access = await context.requireAccess(input.contactEntityId, "view");
      if (access.entity.entityType !== "contact") throw new AccessDeniedError();
      const identifiers = await db
        .select({
          value: contactIdentifiers.value,
          normalizedValue: contactIdentifiers.normalizedValue,
        })
        .from(contactIdentifiers)
        .where(
          and(
            eq(contactIdentifiers.organizationId, org),
            eq(contactIdentifiers.contactEntityId, input.contactEntityId),
            eq(contactIdentifiers.type, "email"),
          ),
        );
      const emails = [
        ...new Set(
          identifiers
            .map((identifier) =>
              normalizeAttendeeEmail(identifier.normalizedValue ?? identifier.value),
            )
            .filter(Boolean),
        ),
      ];
      if (!emails.length) return [];
      return summaries(
        exists(
          db
            .select({ one: sql`1` })
            .from(calendarEventAttendees)
            .where(
              and(
                eq(calendarEventAttendees.organizationId, calendarEvents.organizationId),
                eq(calendarEventAttendees.eventEntityId, calendarEvents.entityId),
                inArray(calendarEventAttendees.normalizedEmail, emails),
              ),
            ),
        ),
        [desc(calendarEvents.startsAt), desc(calendarEvents.entityId)],
        limit,
      );
    },

    async interactionSourceEvents(
      interactionEntityIds: string[],
    ): Promise<Record<string, InteractionSourceEvent>> {
      const ids = [...new Set(interactionEntityIds)];
      if (!ids.length) return {};
      if (ids.some((id) => !uuidPattern.test(id)))
        throw new ValidationError("Invalid interaction ID.");
      await context.requireActiveActor();
      const rows = await db
        .select({
          sourceEntityId: entityLinks.sourceEntityId,
          targetEntityId: entityLinks.targetEntityId,
          entityId: calendarEvents.entityId,
          title: calendarEvents.title,
          startsAt: calendarEvents.startsAt,
        })
        .from(entityLinks)
        .innerJoin(
          calendarEvents,
          and(
            eq(calendarEvents.organizationId, entityLinks.organizationId),
            or(
              eq(calendarEvents.entityId, entityLinks.sourceEntityId),
              eq(calendarEvents.entityId, entityLinks.targetEntityId),
            ),
          ),
        )
        .where(
          and(
            eq(entityLinks.organizationId, org),
            eq(entityLinks.relationType, "related_to"),
            or(inArray(entityLinks.sourceEntityId, ids), inArray(entityLinks.targetEntityId, ids)),
            context.readable(calendarEvents.entityId),
          ),
        )
        .orderBy(asc(calendarEvents.startsAt), asc(calendarEvents.entityId));
      const wanted = new Set(ids);
      const result: Record<string, InteractionSourceEvent> = {};
      for (const row of rows) {
        const interactionId =
          row.sourceEntityId === row.entityId ? row.targetEntityId : row.sourceEntityId;
        if (!wanted.has(interactionId) || result[interactionId]) continue;
        result[interactionId] = {
          entityId: row.entityId,
          title: row.title,
          startsAt: row.startsAt.toISOString(),
        };
      }
      return result;
    },
  };
}
