ALTER TYPE "public"."entity_type" ADD VALUE 'calendar';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'calendar_event';--> statement-breakpoint
ALTER TYPE "public"."contact_interaction_origin" ADD VALUE 'calendar_event';--> statement-breakpoint
CREATE TABLE "calendar_event_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_entity_id" uuid NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"display_name" text,
	"response_status" text NOT NULL,
	"is_organizer" boolean DEFAULT false NOT NULL,
	"is_self" boolean DEFAULT false NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"is_resource" boolean DEFAULT false NOT NULL,
	CONSTRAINT "calendar_event_attendees_email_unique" UNIQUE("organization_id","event_entity_id","normalized_email"),
	CONSTRAINT "calendar_event_attendees_response_check" CHECK ("calendar_event_attendees"."response_status" IN ('needs_action', 'accepted', 'declined', 'tentative')),
	CONSTRAINT "calendar_event_attendees_email_check" CHECK (length(trim("calendar_event_attendees"."normalized_email")) > 0)
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"calendar_entity_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"ical_uid" text,
	"recurring_event_id" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text,
	"location" text,
	"conference_url" text,
	"html_link" text,
	"visibility" text DEFAULT 'default' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"time_zone" text,
	"provider_updated_at" timestamp with time zone,
	"sync_generation" integer NOT NULL,
	"interactions_recorded_at" timestamp with time zone,
	CONSTRAINT "calendar_events_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "calendar_events_provider_unique" UNIQUE("organization_id","calendar_entity_id","provider_event_id"),
	CONSTRAINT "calendar_events_type_check" CHECK ("calendar_events"."entity_type"::text = 'calendar_event'),
	CONSTRAINT "calendar_events_kind_check" CHECK ("calendar_events"."kind" IN ('default', 'focus_time', 'out_of_office', 'working_location', 'birthday', 'from_gmail', 'other')),
	CONSTRAINT "calendar_events_status_check" CHECK ("calendar_events"."status" IN ('confirmed', 'tentative', 'cancelled')),
	CONSTRAINT "calendar_events_visibility_check" CHECK ("calendar_events"."visibility" IN ('default', 'public', 'private', 'confidential')),
	CONSTRAINT "calendar_events_time_check" CHECK ("calendar_events"."ends_at" >= "calendar_events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"owner_actor_entity_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"provider" text NOT NULL,
	"credential_account_id" text,
	"provider_calendar_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"time_zone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"records_interactions" boolean DEFAULT false NOT NULL,
	"interactions_from" timestamp with time zone NOT NULL,
	"sync_window_start" timestamp with time zone NOT NULL,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"sync_cursor" text,
	"sync_generation" integer DEFAULT 0 NOT NULL,
	"next_sync_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"sync_error_code" text,
	"sync_lease_token" uuid,
	"sync_lease_expires_at" timestamp with time zone,
	CONSTRAINT "calendars_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "calendars_owner_calendar_unique" UNIQUE("organization_id","owner_actor_entity_id","provider","provider_calendar_id"),
	CONSTRAINT "calendars_type_check" CHECK ("calendars"."entity_type"::text = 'calendar'),
	CONSTRAINT "calendars_provider_check" CHECK ("calendars"."provider" IN ('google', 'microsoft')),
	CONSTRAINT "calendars_sync_status_check" CHECK ("calendars"."sync_status" IN ('pending', 'active', 'error', 'reauth_required', 'paused', 'disconnected')),
	CONSTRAINT "calendars_name_check" CHECK (length(trim("calendars"."name")) BETWEEN 1 AND 500),
	CONSTRAINT "calendars_lease_check" CHECK (("calendars"."sync_lease_token" IS NULL) = ("calendars"."sync_lease_expires_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "organization_apps" DROP CONSTRAINT "organization_apps_app_id_check";--> statement-breakpoint
ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_organization_id_event_entity_id_calendar_events_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","event_entity_id") REFERENCES "public"."calendar_events"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_calendar_entity_id_calendars_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","calendar_entity_id") REFERENCES "public"."calendars"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_entity_id_calendar_entity_id_entities_organization_id_entity_id_access_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","calendar_entity_id") REFERENCES "public"."entities"("organization_id","entity_id","access_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_credential_account_id_account_id_fk" FOREIGN KEY ("credential_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_organization_id_owner_actor_entity_id_owner_user_id_actors_organization_id_entity_id_user_id_fk" FOREIGN KEY ("organization_id","owner_actor_entity_id","owner_user_id") REFERENCES "public"."actors"("organization_id","entity_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_event_attendees_email_idx" ON "calendar_event_attendees" USING btree ("organization_id","normalized_email");--> statement-breakpoint
CREATE INDEX "calendar_events_agenda_idx" ON "calendar_events" USING btree ("organization_id","calendar_entity_id","starts_at");--> statement-breakpoint
CREATE INDEX "calendar_events_completion_idx" ON "calendar_events" USING btree ("ends_at") WHERE "calendar_events"."interactions_recorded_at" IS NULL AND "calendar_events"."kind" = 'default' AND "calendar_events"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "calendars_due_idx" ON "calendars" USING btree ("next_sync_at") WHERE "calendars"."sync_status" IN ('pending', 'active', 'error');--> statement-breakpoint
ALTER TABLE "organization_apps" ADD CONSTRAINT "organization_apps_app_id_check" CHECK ("organization_apps"."app_id" IN ('tasks', 'crm', 'calendar'));