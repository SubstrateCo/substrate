import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { contacts } from "../../core/contacts/schema";
import { calendarEvents } from "./events.schema";

export const attendeeResponse = pgEnum("attendee_response", [
  "needs_action",
  "accepted",
  "declined",
  "tentative",
]);
export const eventAttendees = pgTable(
  "event_attendees",
  {
    organizationId: text("organization_id").notNull(),
    eventEntityId: uuid("event_entity_id").notNull(),
    calendarEntityId: uuid("calendar_entity_id").notNull(),
    address: text("address").notNull(),
    displayName: text("display_name"),
    contactEntityId: uuid("contact_entity_id"),
    response: attendeeResponse("response").default("needs_action").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.eventEntityId, table.address] }),
    foreignKey({
      columns: [table.organizationId, table.eventEntityId, table.calendarEntityId],
      foreignColumns: [
        calendarEvents.organizationId,
        calendarEvents.entityId,
        calendarEvents.calendarEntityId,
      ],
    }),
    foreignKey({
      columns: [table.organizationId, table.contactEntityId],
      foreignColumns: [contacts.organizationId, contacts.entityId],
    }),
    index("event_attendees_contact_idx").on(table.organizationId, table.contactEntityId),
    check(
      "event_attendees_address_check",
      sql`length(trim(${table.address})) > 0 AND ${table.address} = lower(trim(${table.address}))`,
    ),
  ],
);
