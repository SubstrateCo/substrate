CREATE TYPE "public"."entity_type" AS ENUM('actor', 'contact', 'company', 'project', 'task', 'file', 'folder', 'pipeline', 'deal', 'email_account', 'email_conversation', 'email_message', 'channel', 'thread', 'message', 'calendar', 'calendar_event');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."contact_identifier_type" AS ENUM('email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."permission_level" AS ENUM('view', 'comment', 'edit', 'owner');--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('related_to', 'mentions');--> statement-breakpoint
CREATE TYPE "public"."email_direction" AS ENUM('inbound', 'outbound', 'draft');--> statement-breakpoint
CREATE TYPE "public"."email_participant_kind" AS ENUM('from', 'to', 'cc', 'bcc', 'reply_to');--> statement-breakpoint
CREATE TYPE "public"."email_connection_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."email_provider" AS ENUM('google', 'microsoft', 'imap');--> statement-breakpoint
CREATE TYPE "public"."attendee_response" AS ENUM('needs_action', 'accepted', 'declined', 'tentative');--> statement-breakpoint
CREATE TYPE "public"."calendar_connection_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."calendar_provider" AS ENUM('google', 'microsoft', 'caldav');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"last_organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"inviter_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_organization_user_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"entity_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entities_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "entities_organization_entity_type_unique" UNIQUE("organization_id","entity_id","entity_type")
);
--> statement-breakpoint
CREATE TABLE "actors" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('actor'::entity_type) STORED NOT NULL,
	"type" "actor_type" NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"agent_config" jsonb,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "actors_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "actors_organization_user_unique" UNIQUE("organization_id","user_id"),
	CONSTRAINT "actors_identity_check" CHECK (("actors"."type" = 'human' AND "actors"."user_id" IS NOT NULL AND "actors"."agent_config" IS NULL) OR ("actors"."type" = 'agent' AND "actors"."user_id" IS NULL)),
	CONSTRAINT "actors_name_check" CHECK (length(trim("actors"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "contact_identifiers" (
	"organization_id" text NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"type" "contact_identifier_type" NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "contact_identifiers_organization_id_contact_entity_id_type_value_pk" PRIMARY KEY("organization_id","contact_entity_id","type","value"),
	CONSTRAINT "contact_identifiers_value_check" CHECK (length(trim("contact_identifiers"."value")) > 0)
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('contact'::entity_type) STORED NOT NULL,
	"display_name" text NOT NULL,
	CONSTRAINT "contacts_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "contacts_name_check" CHECK (length(trim("contacts"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "entity_grants" (
	"organization_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"level" "permission_level" NOT NULL,
	CONSTRAINT "entity_grants_organization_id_entity_id_actor_entity_id_pk" PRIMARY KEY("organization_id","entity_id","actor_entity_id")
);
--> statement-breakpoint
CREATE TABLE "entity_access_parents" (
	"organization_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"parent_entity_id" uuid NOT NULL,
	CONSTRAINT "entity_access_parents_organization_id_entity_id_pk" PRIMARY KEY("organization_id","entity_id"),
	CONSTRAINT "entity_access_parents_path_unique" UNIQUE("organization_id","entity_id","parent_entity_id"),
	CONSTRAINT "entity_access_parents_no_self_parent" CHECK ("entity_access_parents"."entity_id" <> "entity_access_parents"."parent_entity_id")
);
--> statement-breakpoint
CREATE TABLE "entity_links" (
	"organization_id" text NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"relation_type" "relation_type" NOT NULL,
	"created_by_actor_entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_links_organization_id_source_entity_id_target_entity_id_relation_type_pk" PRIMARY KEY("organization_id","source_entity_id","target_entity_id","relation_type"),
	CONSTRAINT "entity_links_no_self_link" CHECK ("entity_links"."source_entity_id" <> "entity_links"."target_entity_id")
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('email_account'::entity_type) STORED NOT NULL,
	"display_name" text NOT NULL,
	"email_address" text NOT NULL,
	CONSTRAINT "email_accounts_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "email_accounts_name_check" CHECK (length(trim("email_accounts"."display_name")) > 0),
	CONSTRAINT "email_accounts_address_check" CHECK (length(trim("email_accounts"."email_address")) > 0 AND "email_accounts"."email_address" = lower(trim("email_accounts"."email_address")))
);
--> statement-breakpoint
CREATE TABLE "email_conversations" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('email_conversation'::entity_type) STORED NOT NULL,
	"email_account_entity_id" uuid NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"provider_conversation_id" text,
	CONSTRAINT "email_conversations_account_entity_unique" UNIQUE("organization_id","entity_id","email_account_entity_id"),
	CONSTRAINT "email_conversations_provider_unique" UNIQUE("email_account_entity_id","provider_conversation_id")
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('email_message'::entity_type) STORED NOT NULL,
	"email_account_entity_id" uuid NOT NULL,
	"conversation_entity_id" uuid NOT NULL,
	"provider_message_id" text,
	"internet_message_id" text,
	"subject" text DEFAULT '' NOT NULL,
	"text_body" text,
	"html_body" text,
	"direction" "email_direction" NOT NULL,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	CONSTRAINT "email_messages_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "email_messages_provider_unique" UNIQUE("email_account_entity_id","provider_message_id")
);
--> statement-breakpoint
CREATE TABLE "email_participants" (
	"organization_id" text NOT NULL,
	"email_message_entity_id" uuid NOT NULL,
	"kind" "email_participant_kind" NOT NULL,
	"address" text NOT NULL,
	"display_name" text,
	"contact_entity_id" uuid,
	CONSTRAINT "email_participants_organization_id_email_message_entity_id_kind_address_pk" PRIMARY KEY("organization_id","email_message_entity_id","kind","address"),
	CONSTRAINT "email_participants_address_check" CHECK (length(trim("email_participants"."address")) > 0 AND "email_participants"."address" = lower(trim("email_participants"."address")))
);
--> statement-breakpoint
CREATE TABLE "email_integrations" (
	"email_account_entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" "email_provider" NOT NULL,
	"external_account_id" text NOT NULL,
	"external_resource_id" text NOT NULL,
	"connected_by_actor_entity_id" uuid NOT NULL,
	"credential_reference" text NOT NULL,
	"connection_status" "email_connection_status" DEFAULT 'active' NOT NULL,
	"sync_cursor" text,
	"last_synced_at" timestamp with time zone,
	"last_sync_attempt_at" timestamp with time zone,
	"last_sync_error" text,
	"sync_lease_token" uuid,
	"sync_lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_integrations_external_resource_unique" UNIQUE("organization_id","provider","external_account_id","external_resource_id"),
	CONSTRAINT "email_integrations_required_values" CHECK (length(trim("email_integrations"."external_account_id")) > 0 AND length(trim("email_integrations"."external_resource_id")) > 0 AND length(trim("email_integrations"."credential_reference")) > 0),
	CONSTRAINT "email_integrations_lease_check" CHECK (("email_integrations"."sync_lease_token" IS NULL) = ("email_integrations"."sync_lease_expires_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('calendar'::entity_type) STORED NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	CONSTRAINT "calendars_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "calendars_name_check" CHECK (length(trim("calendars"."name")) > 0),
	CONSTRAINT "calendars_time_zone_check" CHECK (length(trim("calendars"."time_zone")) > 0)
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('calendar_event'::entity_type) STORED NOT NULL,
	"calendar_entity_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"all_day" boolean NOT NULL,
	"time_zone" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"starts_on" date,
	"ends_on" date,
	"recurrence_rule" text,
	"provider_event_id" text,
	CONSTRAINT "calendar_events_calendar_entity_unique" UNIQUE("organization_id","entity_id","calendar_entity_id"),
	CONSTRAINT "calendar_events_provider_unique" UNIQUE("calendar_entity_id","provider_event_id"),
	CONSTRAINT "calendar_events_title_check" CHECK (length(trim("calendar_events"."title")) > 0),
	CONSTRAINT "calendar_events_time_zone_check" CHECK (length(trim("calendar_events"."time_zone")) > 0),
	CONSTRAINT "calendar_events_timing_check" CHECK ((
    "calendar_events"."all_day" AND "calendar_events"."starts_on" IS NOT NULL AND "calendar_events"."ends_on" IS NOT NULL AND "calendar_events"."ends_on" > "calendar_events"."starts_on" AND "calendar_events"."starts_at" IS NULL AND "calendar_events"."ends_at" IS NULL
  ) OR (
    NOT "calendar_events"."all_day" AND "calendar_events"."starts_at" IS NOT NULL AND "calendar_events"."ends_at" IS NOT NULL AND "calendar_events"."ends_at" > "calendar_events"."starts_at" AND "calendar_events"."starts_on" IS NULL AND "calendar_events"."ends_on" IS NULL
  ))
);
--> statement-breakpoint
CREATE TABLE "event_attendees" (
	"organization_id" text NOT NULL,
	"event_entity_id" uuid NOT NULL,
	"calendar_entity_id" uuid NOT NULL,
	"address" text NOT NULL,
	"display_name" text,
	"contact_entity_id" uuid,
	"response" "attendee_response" DEFAULT 'needs_action' NOT NULL,
	CONSTRAINT "event_attendees_organization_id_event_entity_id_address_pk" PRIMARY KEY("organization_id","event_entity_id","address"),
	CONSTRAINT "event_attendees_address_check" CHECK (length(trim("event_attendees"."address")) > 0 AND "event_attendees"."address" = lower(trim("event_attendees"."address")))
);
--> statement-breakpoint
CREATE TABLE "event_recurrence_exceptions" (
	"organization_id" text NOT NULL,
	"event_entity_id" uuid NOT NULL,
	"calendar_entity_id" uuid NOT NULL,
	"occurrence_key" text NOT NULL,
	"cancelled" boolean NOT NULL,
	"replacement_event_entity_id" uuid,
	CONSTRAINT "event_recurrence_exceptions_organization_id_event_entity_id_occurrence_key_pk" PRIMARY KEY("organization_id","event_entity_id","occurrence_key"),
	CONSTRAINT "event_recurrence_exceptions_key_check" CHECK (length(trim("event_recurrence_exceptions"."occurrence_key")) > 0),
	CONSTRAINT "event_recurrence_exceptions_action_check" CHECK (("event_recurrence_exceptions"."cancelled" AND "event_recurrence_exceptions"."replacement_event_entity_id" IS NULL) OR (NOT "event_recurrence_exceptions"."cancelled" AND "event_recurrence_exceptions"."replacement_event_entity_id" IS NOT NULL AND "event_recurrence_exceptions"."replacement_event_entity_id" <> "event_recurrence_exceptions"."event_entity_id"))
);
--> statement-breakpoint
CREATE TABLE "calendar_integrations" (
	"calendar_entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"external_account_id" text NOT NULL,
	"external_resource_id" text NOT NULL,
	"connected_by_actor_entity_id" uuid NOT NULL,
	"credential_reference" text NOT NULL,
	"connection_status" "calendar_connection_status" DEFAULT 'active' NOT NULL,
	"sync_cursor" text,
	"last_synced_at" timestamp with time zone,
	"last_sync_attempt_at" timestamp with time zone,
	"last_sync_error" text,
	"sync_lease_token" uuid,
	"sync_lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_integrations_external_resource_unique" UNIQUE("organization_id","provider","external_account_id","external_resource_id"),
	CONSTRAINT "calendar_integrations_required_values" CHECK (length(trim("calendar_integrations"."external_account_id")) > 0 AND length(trim("calendar_integrations"."external_resource_id")) > 0 AND length(trim("calendar_integrations"."credential_reference")) > 0),
	CONSTRAINT "calendar_integrations_lease_check" CHECK (("calendar_integrations"."sync_lease_token" IS NULL) = ("calendar_integrations"."sync_lease_expires_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "messaging_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"private" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_kind_check" CHECK ("messaging_conversations"."kind" IN ('dm', 'group', 'channel')),
	CONSTRAINT "messaging_visibility_check" CHECK ("messaging_conversations"."kind" = 'channel' OR "messaging_conversations"."private"),
	CONSTRAINT "messaging_channel_name_check" CHECK ("messaging_conversations"."kind" <> 'channel' OR length(trim("messaging_conversations"."name")) > 0 AND "messaging_conversations"."name" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "messaging_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"thread_id" uuid,
	"is_root" boolean GENERATED ALWAYS AS (thread_id IS NULL) STORED,
	"thread_root" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_message_conversation_unique" UNIQUE("conversation_id","id"),
	CONSTRAINT "messaging_message_root_unique" UNIQUE("conversation_id","id","is_root"),
	CONSTRAINT "messaging_thread_root_check" CHECK ("messaging_messages"."thread_root"),
	CONSTRAINT "messaging_body_check" CHECK (length(trim("messaging_messages"."body")) BETWEEN 1 AND 20000)
);
--> statement-breakpoint
CREATE TABLE "messaging_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	CONSTRAINT "messaging_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "messaging_reactions" (
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	CONSTRAINT "messaging_reactions_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji"),
	CONSTRAINT "messaging_emoji_check" CHECK (length(trim("messaging_reactions"."emoji")) BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE TABLE "project_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"project_entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "project_statuses_project_id_unique" UNIQUE("organization_id","project_entity_id","id"),
	CONSTRAINT "project_statuses_name_unique" UNIQUE("project_entity_id","name"),
	CONSTRAINT "project_statuses_name_check" CHECK (length(trim("project_statuses"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "project_statuses_category_check" CHECK ("project_statuses"."category" IN ('todo', 'active', 'done', 'canceled'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('project'::entity_type) STORED NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "projects_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "projects_name_check" CHECK (length(trim("projects"."name")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('task'::entity_type) STORED NOT NULL,
	"project_entity_id" uuid NOT NULL,
	"parent_task_entity_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status_id" uuid NOT NULL,
	"priority" text DEFAULT 'none' NOT NULL,
	"assignee_actor_entity_id" uuid,
	"due_date" date,
	CONSTRAINT "tasks_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "tasks_project_entity_unique" UNIQUE("organization_id","project_entity_id","entity_id"),
	CONSTRAINT "tasks_title_check" CHECK (length(trim("tasks"."title")) BETWEEN 1 AND 300),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" IN ('none', 'low', 'medium', 'high', 'urgent')),
	CONSTRAINT "tasks_parent_check" CHECK ("tasks"."entity_id" <> "tasks"."parent_task_entity_id")
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"task_entity_id" uuid NOT NULL,
	"author_actor_entity_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_comments_body_check" CHECK (length(trim("task_comments"."body")) BETWEEN 1 AND 20000)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD CONSTRAINT "contact_identifiers_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_grants" ADD CONSTRAINT "entity_grants_organization_id_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_grants" ADD CONSTRAINT "entity_grants_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_access_parents" ADD CONSTRAINT "entity_access_parents_organization_id_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_access_parents" ADD CONSTRAINT "entity_access_parents_organization_id_parent_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","parent_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_organization_id_source_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","source_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_organization_id_target_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","target_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_organization_id_created_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","created_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_conversations" ADD CONSTRAINT "email_conversations_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_conversations" ADD CONSTRAINT "email_conversations_organization_id_email_account_entity_id_email_accounts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","email_account_entity_id") REFERENCES "public"."email_accounts"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_conversations" ADD CONSTRAINT "email_conversations_organization_id_entity_id_email_account_entity_id_entity_access_parents_organization_id_entity_id_parent_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","email_account_entity_id") REFERENCES "public"."entity_access_parents"("organization_id","entity_id","parent_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_organization_id_conversation_entity_id_email_account_entity_id_email_conversations_organization_id_entity_id_email_account_entity_id_fk" FOREIGN KEY ("organization_id","conversation_entity_id","email_account_entity_id") REFERENCES "public"."email_conversations"("organization_id","entity_id","email_account_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_organization_id_entity_id_conversation_entity_id_entity_access_parents_organization_id_entity_id_parent_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","conversation_entity_id") REFERENCES "public"."entity_access_parents"("organization_id","entity_id","parent_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_participants" ADD CONSTRAINT "email_participants_organization_id_email_message_entity_id_email_messages_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","email_message_entity_id") REFERENCES "public"."email_messages"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_participants" ADD CONSTRAINT "email_participants_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_integrations" ADD CONSTRAINT "email_integrations_organization_id_email_account_entity_id_email_accounts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","email_account_entity_id") REFERENCES "public"."email_accounts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_integrations" ADD CONSTRAINT "email_integrations_organization_id_connected_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","connected_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_calendar_entity_id_calendars_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","calendar_entity_id") REFERENCES "public"."calendars"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_entity_id_calendar_entity_id_entity_access_parents_organization_id_entity_id_parent_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","calendar_entity_id") REFERENCES "public"."entity_access_parents"("organization_id","entity_id","parent_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_organization_id_event_entity_id_calendar_entity_id_calendar_events_organization_id_entity_id_calendar_entity_id_fk" FOREIGN KEY ("organization_id","event_entity_id","calendar_entity_id") REFERENCES "public"."calendar_events"("organization_id","entity_id","calendar_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_recurrence_exceptions" ADD CONSTRAINT "event_recurrence_exceptions_organization_id_event_entity_id_calendar_entity_id_calendar_events_organization_id_entity_id_calendar_entity_id_fk" FOREIGN KEY ("organization_id","event_entity_id","calendar_entity_id") REFERENCES "public"."calendar_events"("organization_id","entity_id","calendar_entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_recurrence_exceptions" ADD CONSTRAINT "event_recurrence_exceptions_organization_id_replacement_event_entity_id_calendar_entity_id_calendar_events_organization_id_entity_id_calendar_entity_id_fk" FOREIGN KEY ("organization_id","replacement_event_entity_id","calendar_entity_id") REFERENCES "public"."calendar_events"("organization_id","entity_id","calendar_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_integrations" ADD CONSTRAINT "calendar_integrations_organization_id_calendar_entity_id_calendars_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","calendar_entity_id") REFERENCES "public"."calendars"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_integrations" ADD CONSTRAINT "calendar_integrations_organization_id_connected_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","connected_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_author_id_messaging_participants_conversation_id_user_id_fk" FOREIGN KEY ("conversation_id","author_id") REFERENCES "public"."messaging_participants"("conversation_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_thread_root_fk" FOREIGN KEY ("conversation_id","thread_id","thread_root") REFERENCES "public"."messaging_messages"("conversation_id","id","is_root") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_reactions" ADD CONSTRAINT "messaging_reactions_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_reactions" ADD CONSTRAINT "messaging_reactions_conversation_id_user_id_messaging_participants_conversation_id_user_id_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."messaging_participants"("conversation_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_statuses" ADD CONSTRAINT "project_statuses_organization_id_project_entity_id_projects_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","project_entity_id") REFERENCES "public"."projects"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_project_entity_id_projects_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","project_entity_id") REFERENCES "public"."projects"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_project_entity_id_entity_access_parents_organization_id_entity_id_parent_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","project_entity_id") REFERENCES "public"."entity_access_parents"("organization_id","entity_id","parent_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_project_entity_id_parent_task_entity_id_tasks_organization_id_project_entity_id_entity_id_fk" FOREIGN KEY ("organization_id","project_entity_id","parent_task_entity_id") REFERENCES "public"."tasks"("organization_id","project_entity_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_project_entity_id_status_id_project_statuses_organization_id_project_entity_id_id_fk" FOREIGN KEY ("organization_id","project_entity_id","status_id") REFERENCES "public"."project_statuses"("organization_id","project_entity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_assignee_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","assignee_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organization_id_author_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","author_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "invitation_organization_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entities_organization_type_idx" ON "entities" USING btree ("organization_id","entity_type");--> statement-breakpoint
CREATE INDEX "actors_user_idx" ON "actors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contact_identifiers_lookup_idx" ON "contact_identifiers" USING btree ("organization_id","type","value");--> statement-breakpoint
CREATE INDEX "contacts_organization_idx" ON "contacts" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE INDEX "entity_grants_actor_idx" ON "entity_grants" USING btree ("organization_id","actor_entity_id","entity_id");--> statement-breakpoint
CREATE INDEX "entity_access_parents_parent_idx" ON "entity_access_parents" USING btree ("organization_id","parent_entity_id");--> statement-breakpoint
CREATE INDEX "entity_links_target_idx" ON "entity_links" USING btree ("organization_id","target_entity_id");--> statement-breakpoint
CREATE INDEX "email_conversations_account_idx" ON "email_conversations" USING btree ("organization_id","email_account_entity_id","entity_id");--> statement-breakpoint
CREATE INDEX "email_messages_conversation_idx" ON "email_messages" USING btree ("organization_id","conversation_entity_id","entity_id");--> statement-breakpoint
CREATE INDEX "email_participants_contact_idx" ON "email_participants" USING btree ("organization_id","contact_entity_id");--> statement-breakpoint
CREATE INDEX "calendar_events_calendar_idx" ON "calendar_events" USING btree ("organization_id","calendar_entity_id","entity_id");--> statement-breakpoint
CREATE INDEX "event_attendees_contact_idx" ON "event_attendees" USING btree ("organization_id","contact_entity_id");--> statement-breakpoint
CREATE INDEX "messaging_message_timeline_idx" ON "messaging_messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messaging_participants_user_idx" ON "messaging_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("organization_id","project_entity_id");--> statement-breakpoint
CREATE INDEX "task_comments_timeline_idx" ON "task_comments" USING btree ("organization_id","task_entity_id","created_at","id");