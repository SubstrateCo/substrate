import type { AttendeeResponseStatus, CalendarEventKind } from "@substrate/contracts/calendar";

import { rootEntityValues } from "../core/entities/identity";
import * as schema from "../schema";
import type { setupDatabase } from "./database";

type Fixture = ReturnType<typeof setupDatabase>;

export interface TestAttendee {
  email: string;
  displayName?: string | null;
  responseStatus?: AttendeeResponseStatus;
  isSelf?: boolean;
  isResource?: boolean;
}

export async function enableCalendar(f: Fixture, organizationId = f.orgA) {
  await f.verifyEmails();
  await f.db
    .insert(schema.organizationApps)
    .values({ organizationId, appId: "calendar", enabled: true });
}

export async function insertCalendar(
  f: Fixture,
  options: { recordsInteractions?: boolean; interactionsFrom?: Date } = {},
) {
  const entity = rootEntityValues(f.orgA, "calendar");
  await f.db.insert(schema.entities).values(entity);
  await f.db.insert(schema.entityGrants).values({
    organizationId: f.orgA,
    entityId: entity.entityId,
    actorEntityId: f.alice,
    level: "owner",
  });
  const start = options.interactionsFrom ?? new Date("2026-01-01T00:00:00Z");
  await f.db.insert(schema.calendars).values({
    entityId: entity.entityId,
    organizationId: f.orgA,
    entityType: "calendar",
    ownerActorEntityId: f.alice,
    ownerUserId: "alice",
    provider: "google",
    providerCalendarId: `primary-${entity.entityId}`,
    name: "Alice",
    recordsInteractions: options.recordsInteractions ?? true,
    interactionsFrom: start,
    syncWindowStart: start,
    syncStatus: "disconnected",
  });
  return entity.entityId;
}

export async function insertMeeting(
  f: Fixture,
  calendarEntityId: string,
  options: {
    title?: string;
    kind?: CalendarEventKind;
    visibility?: "default" | "private";
    startsAt?: Date;
    endsAt?: Date;
    attendees?: TestAttendee[];
  } = {},
) {
  const entityId = crypto.randomUUID();
  await f.db.insert(schema.entities).values({
    entityId,
    organizationId: f.orgA,
    entityType: "calendar_event",
    accessEntityId: calendarEntityId,
  });
  const endsAt = options.endsAt ?? new Date("2026-11-10T10:30:00Z");
  await f.db.insert(schema.calendarEvents).values({
    entityId,
    organizationId: f.orgA,
    entityType: "calendar_event",
    calendarEntityId,
    providerEventId: entityId,
    kind: options.kind ?? "default",
    status: "confirmed",
    title: options.title ?? "Quarterly review",
    visibility: options.visibility ?? "default",
    startsAt: options.startsAt ?? new Date(endsAt.getTime() - 30 * 60_000),
    endsAt,
    syncGeneration: 0,
  });
  const attendees = options.attendees ?? [];
  const self: TestAttendee[] = attendees.some((attendee) => attendee.isSelf)
    ? []
    : [{ email: "alice@example.com", isSelf: true, responseStatus: "accepted" }];
  await f.db.insert(schema.calendarEventAttendees).values(
    [...self, ...attendees].map((attendee) => ({
      organizationId: f.orgA,
      eventEntityId: entityId,
      email: attendee.email,
      normalizedEmail: attendee.email.toLowerCase(),
      displayName: attendee.displayName ?? null,
      responseStatus: attendee.responseStatus ?? "accepted",
      isSelf: attendee.isSelf ?? false,
      isResource: attendee.isResource ?? false,
    })),
  );
  return entityId;
}
