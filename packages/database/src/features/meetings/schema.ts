import type { MeetingPerson, MeetingProvider, SourceInput } from "@substrate/contracts/meetings";

import { actors } from "../../core/actors/schema";
import { entities, entityType } from "../../core/entities/schema";
import { idColumn } from "../../core/ids";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// The archive is a private access container, shared by the owner's devices, not by the organization.
export const meetingArchives = pgTable(
  "meeting_archives",
  {
    id: uuid("entity_id").primaryKey(),
    org: text("organization_id").notNull(),
    type: entityType("entity_type").notNull(),
    owner: uuid("owner_actor_entity_id").notNull(),
    // Import and review both advance the revision. Concurrent sources must match against the
    // last committed archive, even when they are different recordings of the same occurrence.
    revision: integer("revision").notNull().default(0),
  },
  (t) => [
    unique("meeting_archives_owner").on(t.org, t.owner),
    unique("meeting_archives_scope").on(t.org, t.id),
    foreignKey({
      name: "meeting_archive_entity",
      columns: [t.org, t.id, t.type],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    foreignKey({
      name: "meeting_archive_owner",
      columns: [t.org, t.owner],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    // Like Calendar, compare as text so a fresh install can run enum expansion and DDL together.
    check("meeting_archive_type", sql`${t.type}::text = 'meeting_archive'`),
  ],
);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("entity_id").primaryKey(),
    org: text("organization_id").notNull(),
    archiveId: uuid("archive_entity_id").notNull(),
    type: entityType("entity_type").notNull(),
    title: text("title").notNull(),
    localStart: text("local_start").notNull(),
    startMs: bigint("start_ms", { mode: "number" }),
    durationMs: bigint("duration_ms", { mode: "number" }),
    platform: text("platform"),
    people: jsonb("people").$type<MeetingPerson[]>().notNull(),
    providers: jsonb("providers").$type<MeetingProvider[]>().notNull(),
    notes: boolean("has_notes").notNull(),
    transcript: boolean("has_transcript").notNull(),
  },
  (t) => [
    foreignKey({
      name: "meeting_entity",
      columns: [t.org, t.id, t.type],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    foreignKey({
      name: "meeting_archive_fk",
      columns: [t.org, t.archiveId],
      foreignColumns: [meetingArchives.org, meetingArchives.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "meeting_access_container",
      columns: [t.org, t.id, t.archiveId],
      foreignColumns: [entities.organizationId, entities.entityId, entities.accessEntityId],
    }),
    check("meeting_type", sql`${t.type}::text = 'meeting'`),
    unique("meeting_in_archive").on(t.org, t.archiveId, t.id),
    index("meetings_by_date").on(t.archiveId, t.localStart, t.id),
    index("meetings_by_instant").on(t.archiveId, t.startMs),
  ],
);

// Existing source IDs are provenance for archived originals; they no longer carry sync state.
export const meetingSources = pgTable(
  "meeting_connections",
  {
    id: idColumn(),
    org: text("organization_id").notNull(),
    archiveId: uuid("archive_entity_id").notNull(),
    provider: text("provider").$type<MeetingProvider>().notNull(),
    sourceKey: text("source_key").notNull(),
    label: text("label").notNull(),
  },
  (t) => [
    foreignKey({
      name: "meeting_source_archive",
      columns: [t.org, t.archiveId],
      foreignColumns: [meetingArchives.org, meetingArchives.id],
    }).onDelete("cascade"),
    unique("meeting_source_identity").on(t.archiveId, t.provider, t.sourceKey),
    unique("meeting_source_scope").on(t.org, t.archiveId, t.id, t.provider),
  ],
);

export const meetingOriginals = pgTable(
  "meeting_originals",
  {
    id: idColumn(),
    org: text("organization_id").notNull(),
    archiveId: uuid("archive_entity_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    provider: text("provider").$type<MeetingProvider>().notNull(),
    sourceKey: text("source_key").notNull(),
    meetingId: uuid("meeting_entity_id"),
    candidateId: uuid("candidate_entity_id"),
    occurrence: text("occurrence"),
    digest: text("digest").notNull(),
    meta: jsonb("metadata").$type<Omit<SourceInput, "notes" | "raw" | "turns">>().notNull(),
    notes: text("notes"),
    turns: jsonb("turns").$type<SourceInput["turns"]>().notNull(),
    raw: text("raw").notNull(),
    hasTranscript: boolean("has_transcript").notNull(),
    searchText: text("search_text").notNull(),
  },
  (t) => [
    unique("meeting_original_identity").on(t.connectionId, t.sourceKey),
    foreignKey({
      name: "meeting_original_connection",
      columns: [t.org, t.archiveId, t.connectionId, t.provider],
      foreignColumns: [
        meetingSources.org,
        meetingSources.archiveId,
        meetingSources.id,
        meetingSources.provider,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "meeting_original_meeting",
      columns: [t.org, t.archiveId, t.meetingId],
      foreignColumns: [meetings.org, meetings.archiveId, meetings.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "meeting_original_candidate",
      columns: [t.org, t.archiveId, t.candidateId],
      foreignColumns: [meetings.org, meetings.archiveId, meetings.id],
    }).onDelete("cascade"),
    check("meeting_original_target", sql`num_nonnulls(${t.meetingId}, ${t.candidateId}) = 1`),
    index("meeting_originals_attached").on(t.archiveId, t.meetingId),
    index("meeting_originals_occurrence").on(t.archiveId, t.occurrence),
  ],
);
