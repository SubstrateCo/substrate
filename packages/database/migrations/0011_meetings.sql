ALTER TYPE "public"."entity_type" ADD VALUE 'meeting_archive';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'meeting';--> statement-breakpoint
CREATE TABLE "meeting_archives" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"owner_actor_entity_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "meeting_archives_owner" UNIQUE("organization_id","owner_actor_entity_id"),
	CONSTRAINT "meeting_archives_scope" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "meeting_archive_type" CHECK ("meeting_archives"."entity_type"::text = 'meeting_archive')
);
--> statement-breakpoint
CREATE TABLE "meeting_originals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"archive_entity_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"source_key" text NOT NULL,
	"meeting_entity_id" uuid,
	"candidate_entity_id" uuid,
	"occurrence" text,
	"digest" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"notes" text,
	"turns" jsonb NOT NULL,
	"raw" text NOT NULL,
	"has_transcript" boolean NOT NULL,
	"search_text" text NOT NULL,
	CONSTRAINT "meeting_original_identity" UNIQUE("connection_id","source_key"),
	CONSTRAINT "meeting_original_target" CHECK (num_nonnulls("meeting_originals"."meeting_entity_id", "meeting_originals"."candidate_entity_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "meeting_connections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"archive_entity_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"source_key" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "meeting_source_identity" UNIQUE("archive_entity_id","provider","source_key"),
	CONSTRAINT "meeting_source_scope" UNIQUE("organization_id","archive_entity_id","id","provider")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"archive_entity_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"title" text NOT NULL,
	"local_start" text NOT NULL,
	"start_ms" bigint,
	"duration_ms" bigint,
	"platform" text,
	"people" jsonb NOT NULL,
	"providers" jsonb NOT NULL,
	"has_notes" boolean NOT NULL,
	"has_transcript" boolean NOT NULL,
	CONSTRAINT "meeting_in_archive" UNIQUE("organization_id","archive_entity_id","entity_id"),
	CONSTRAINT "meeting_type" CHECK ("meetings"."entity_type"::text = 'meeting')
);
--> statement-breakpoint
ALTER TABLE "meeting_archives" ADD CONSTRAINT "meeting_archive_entity" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_archives" ADD CONSTRAINT "meeting_archive_owner" FOREIGN KEY ("organization_id","owner_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_originals" ADD CONSTRAINT "meeting_original_connection" FOREIGN KEY ("organization_id","archive_entity_id","connection_id","provider") REFERENCES "public"."meeting_connections"("organization_id","archive_entity_id","id","provider") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_originals" ADD CONSTRAINT "meeting_original_meeting" FOREIGN KEY ("organization_id","archive_entity_id","meeting_entity_id") REFERENCES "public"."meetings"("organization_id","archive_entity_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_originals" ADD CONSTRAINT "meeting_original_candidate" FOREIGN KEY ("organization_id","archive_entity_id","candidate_entity_id") REFERENCES "public"."meetings"("organization_id","archive_entity_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_connections" ADD CONSTRAINT "meeting_source_archive" FOREIGN KEY ("organization_id","archive_entity_id") REFERENCES "public"."meeting_archives"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meeting_entity" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meeting_archive_fk" FOREIGN KEY ("organization_id","archive_entity_id") REFERENCES "public"."meeting_archives"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meeting_access_container" FOREIGN KEY ("organization_id","entity_id","archive_entity_id") REFERENCES "public"."entities"("organization_id","entity_id","access_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_originals_attached" ON "meeting_originals" USING btree ("archive_entity_id","meeting_entity_id");--> statement-breakpoint
CREATE INDEX "meeting_originals_occurrence" ON "meeting_originals" USING btree ("archive_entity_id","occurrence");--> statement-breakpoint
CREATE INDEX "meetings_by_date" ON "meetings" USING btree ("archive_entity_id","local_start","entity_id");--> statement-breakpoint
CREATE INDEX "meetings_by_instant" ON "meetings" USING btree ("archive_entity_id","start_ms");--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_reference_meeting_source" CHECK ("message_entity_references"."entity_type"::text <> 'meeting' OR "message_entity_references"."purpose" = 'source');