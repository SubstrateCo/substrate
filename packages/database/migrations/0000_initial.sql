CREATE TYPE "public"."entity_type" AS ENUM('actor', 'contact', 'company', 'project', 'task', 'file', 'folder', 'pipeline', 'deal', 'email_account', 'email_conversation', 'email_message', 'channel', 'thread', 'message', 'calendar', 'calendar_event');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."contact_identifier_type" AS ENUM('email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."permission_level" AS ENUM('view', 'comment', 'edit', 'owner');--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('related_to', 'mentions');--> statement-breakpoint
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
	"user_agent_id" uuid,
	"name" text NOT NULL,
	"agent_config" jsonb,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "actors_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "actors_organization_entity_type_unique" UNIQUE("organization_id","entity_id","type"),
	CONSTRAINT "actors_organization_user_unique" UNIQUE("organization_id","user_id"),
	CONSTRAINT "actors_organization_user_agent_unique" UNIQUE("organization_id","user_agent_id"),
	CONSTRAINT "actors_identity_check" CHECK (("actors"."type" = 'human' AND "actors"."user_id" IS NOT NULL AND "actors"."agent_config" IS NULL) OR ("actors"."type" = 'agent' AND "actors"."user_id" IS NULL)),
	CONSTRAINT "actors_name_check" CHECK (length(trim("actors"."name")) > 0),
	CONSTRAINT "actors_user_agent_type_check" CHECK ("actors"."user_agent_id" IS NULL OR "actors"."type" = 'agent')
);
--> statement-breakpoint
CREATE TABLE "user_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"instructions" text NOT NULL,
	"harness" text NOT NULL,
	"model" text,
	"image_file_id" uuid,
	"picture_purpose" text DEFAULT 'avatar' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"use_startup_defaults" boolean DEFAULT true NOT NULL,
	"home_device_id" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_agents_owner_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "user_agent_picture_purpose" CHECK ("user_agents"."picture_purpose" = 'avatar')
);
--> statement-breakpoint
CREATE TABLE "desktop_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desktop_devices_user_installation_unique" UNIQUE("user_id","installation_id"),
	CONSTRAINT "desktop_devices_user_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "desktop_devices_name_check" CHECK (length(trim("desktop_devices"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "desktop_devices_platform_check" CHECK (length("desktop_devices"."platform") BETWEEN 1 AND 40)
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
CREATE TABLE "file_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" text,
	"organization_id" text,
	"uploaded_by" text NOT NULL,
	"purpose" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"temporary_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"temporary_cleaned_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_uploads_temporary_key_unique" UNIQUE("temporary_key"),
	CONSTRAINT "file_upload_owner" CHECK (("file_uploads"."purpose" = 'avatar' AND "file_uploads"."owner_user_id" IS NOT NULL AND "file_uploads"."organization_id" IS NULL AND "file_uploads"."uploaded_by" = "file_uploads"."owner_user_id") OR ("file_uploads"."purpose" IN ('organization-logo', 'file') AND "file_uploads"."organization_id" IS NOT NULL AND "file_uploads"."owner_user_id" IS NULL)),
	CONSTRAINT "file_upload_size" CHECK ("file_uploads"."size" > 0 AND "file_uploads"."size" <= 5242880)
);
--> statement-breakpoint
CREATE TABLE "storage_candidates" (
	"object_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" text,
	"organization_id" text,
	"uploaded_by" text,
	"purpose" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_files_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "stored_file_user_purpose" UNIQUE("id","owner_user_id","purpose"),
	CONSTRAINT "stored_file_organization_purpose" UNIQUE("id","organization_id","purpose"),
	CONSTRAINT "stored_file_owner" CHECK (("stored_files"."purpose" = 'avatar' AND "stored_files"."owner_user_id" IS NOT NULL AND "stored_files"."organization_id" IS NULL AND "stored_files"."uploaded_by" = "stored_files"."owner_user_id") OR ("stored_files"."purpose" IN ('organization-logo', 'file') AND "stored_files"."organization_id" IS NOT NULL AND "stored_files"."owner_user_id" IS NULL)),
	CONSTRAINT "stored_file_size" CHECK ("stored_files"."size" > 0 AND "stored_files"."size" <= 5242880),
	CONSTRAINT "stored_file_image_type" CHECK ("stored_files"."purpose" = 'file' OR "stored_files"."content_type" = 'image/webp')
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
	CONSTRAINT "messaging_conversation_organization_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "messaging_kind_check" CHECK ("messaging_conversations"."kind" IN ('dm', 'group', 'channel')),
	CONSTRAINT "messaging_visibility_check" CHECK ("messaging_conversations"."kind" = 'channel' OR "messaging_conversations"."private"),
	CONSTRAINT "messaging_channel_name_check" CHECK ("messaging_conversations"."kind" <> 'channel' OR length(trim("messaging_conversations"."name")) > 0 AND "messaging_conversations"."name" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "messaging_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_id" text,
	"author_actor_entity_id" uuid NOT NULL,
	"author_organization_id" text NOT NULL,
	"body" text NOT NULL,
	"request_id" uuid,
	"thread_id" uuid,
	"is_root" boolean GENERATED ALWAYS AS (thread_id IS NULL) STORED,
	"thread_root" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_message_conversation_unique" UNIQUE("conversation_id","id"),
	CONSTRAINT "messaging_message_request_unique" UNIQUE("author_id","request_id"),
	CONSTRAINT "messaging_actor_message_request_unique" UNIQUE("author_actor_entity_id","request_id"),
	CONSTRAINT "messaging_message_root_unique" UNIQUE("conversation_id","id","is_root"),
	CONSTRAINT "messaging_author_check" CHECK (("messaging_messages"."author_id" IS NOT NULL OR "messaging_messages"."author_actor_entity_id" IS NOT NULL) AND (("messaging_messages"."author_actor_entity_id" IS NULL) = ("messaging_messages"."author_organization_id" IS NULL))),
	CONSTRAINT "messaging_thread_root_check" CHECK ("messaging_messages"."thread_root"),
	CONSTRAINT "messaging_body_check" CHECK (length(trim("messaging_messages"."body")) BETWEEN 1 AND 20000)
);
--> statement-breakpoint
CREATE TABLE "messaging_participants" (
	"conversation_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "messaging_participants_conversation_id_actor_entity_id_pk" PRIMARY KEY("conversation_id","actor_entity_id")
);
--> statement-breakpoint
CREATE TABLE "messaging_reactions" (
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	CONSTRAINT "messaging_reactions_message_id_actor_entity_id_emoji_pk" PRIMARY KEY("message_id","actor_entity_id","emoji"),
	CONSTRAINT "messaging_emoji_check" CHECK (length(trim("messaging_reactions"."emoji")) BETWEEN 1 AND 64)
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
	"status" text DEFAULT 'not_started' NOT NULL,
	"priority" text DEFAULT 'none' NOT NULL,
	"assignee_actor_entity_id" uuid,
	"due_date" date,
	CONSTRAINT "tasks_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "tasks_project_entity_unique" UNIQUE("organization_id","project_entity_id","entity_id"),
	CONSTRAINT "tasks_title_check" CHECK (length(trim("tasks"."title")) BETWEEN 1 AND 300),
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" IN ('not_started', 'in_progress', 'in_review', 'completed', 'canceled')),
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
CREATE TABLE "message_entity_references" (
	"organization_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"purpose" text NOT NULL,
	"created_by_actor_entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_entity_references_message_id_entity_id_purpose_pk" PRIMARY KEY("message_id","entity_id","purpose"),
	CONSTRAINT "message_reference_type_check" CHECK ("message_entity_references"."entity_type" IN ('task', 'project')),
	CONSTRAINT "message_reference_purpose_check" CHECK ("message_entity_references"."purpose" IN ('source', 'mention', 'association'))
);
--> statement-breakpoint
CREATE TABLE "message_messaging_references" (
	"organization_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"target_conversation_id" uuid NOT NULL,
	"target_thread_id" uuid,
	"thread_root" boolean DEFAULT true NOT NULL,
	CONSTRAINT "message_messaging_references_message_id_kind_target_id_pk" PRIMARY KEY("message_id","kind","target_id"),
	CONSTRAINT "messaging_reference_target_check" CHECK (
      ("message_messaging_references"."kind" = 'channel' AND "message_messaging_references"."target_id" = "message_messaging_references"."target_conversation_id" AND "message_messaging_references"."target_thread_id" IS NULL)
      OR ("message_messaging_references"."kind" = 'thread' AND "message_messaging_references"."target_thread_id" IS NOT NULL AND "message_messaging_references"."target_id" = "message_messaging_references"."target_thread_id")
    ),
	CONSTRAINT "messaging_reference_root_check" CHECK ("message_messaging_references"."thread_root")
);
--> statement-breakpoint
CREATE TABLE "source_task_requests" (
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"task_entity_id" uuid NOT NULL,
	CONSTRAINT "source_task_requests_organization_id_actor_entity_id_request_id_pk" PRIMARY KEY("organization_id","actor_entity_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "task_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"task_entity_id" uuid NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"source_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"recipient_actor_entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"event_key" text NOT NULL,
	"entity_id" uuid,
	"message_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_event_recipient_unique" UNIQUE("recipient_actor_entity_id","event_key"),
	CONSTRAINT "notification_target_check" CHECK (("notifications"."entity_id" IS NULL) <> ("notifications"."message_id" IS NULL)),
	CONSTRAINT "notification_kind_check" CHECK ("notifications"."kind" IN ('assignment', 'mention', 'reply'))
);
--> statement-breakpoint
CREATE TABLE "agent_tool_requests" (
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "agent_tool_requests_organization_id_actor_entity_id_tool_request_id_pk" PRIMARY KEY("organization_id","actor_entity_id","tool","request_id")
);
--> statement-breakpoint
CREATE TABLE "user_agent_triggers" (
	"user_agent_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"prompt" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_agent_triggers_user_agent_id_kind_pk" PRIMARY KEY("user_agent_id","kind"),
	CONSTRAINT "user_agent_trigger_kind_check" CHECK ("user_agent_triggers"."kind" IN ('direct_message', 'mention', 'thread_reply')),
	CONSTRAINT "user_agent_trigger_prompt_check" CHECK ("user_agent_triggers"."prompt" IS NULL OR length(trim("user_agent_triggers"."prompt")) BETWEEN 1 AND 20000)
);
--> statement-breakpoint
CREATE TABLE "agent_run_events" (
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_run_events_run_id_sequence_pk" PRIMARY KEY("run_id","sequence"),
	CONSTRAINT "agent_run_event_kind_check" CHECK ("agent_run_events"."kind" IN ('text', 'activity', 'error')),
	CONSTRAINT "agent_run_event_text_check" CHECK (length("agent_run_events"."text") <= 20000)
);
--> statement-breakpoint
CREATE TABLE "agent_run_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"native_request_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb,
	"resolved_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "agent_run_requests_native_unique" UNIQUE("run_id","native_request_id"),
	CONSTRAINT "agent_run_request_status_check" CHECK ("agent_run_requests"."status" IN ('pending', 'resolved', 'cancelled', 'expired')),
	CONSTRAINT "agent_run_request_response_check" CHECK (("agent_run_requests"."status" = 'resolved') = ("agent_run_requests"."response" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "agent_run_triggers" (
	"run_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_run_triggers_run_id_message_id_pk" PRIMARY KEY("run_id","message_id"),
	CONSTRAINT "agent_run_trigger_kind_check" CHECK ("agent_run_triggers"."kind" IN ('direct_message', 'mention', 'thread_reply'))
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"agent_actor_entity_id" uuid NOT NULL,
	"user_agent_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"trigger_kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"device_id" uuid,
	"lease_expires_at" timestamp with time zone,
	"harness_session_id" text,
	"activity" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	CONSTRAINT "agent_run_status_check" CHECK ("agent_runs"."status" IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'expired')),
	CONSTRAINT "agent_run_trigger_check" CHECK ("agent_runs"."trigger_kind" IN ('direct_message', 'mention', 'thread_reply')),
	CONSTRAINT "agent_run_lease_check" CHECK ("agent_runs"."status" <> 'running' OR ("agent_runs"."device_id" IS NOT NULL AND "agent_runs"."lease_expires_at" IS NOT NULL))
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
ALTER TABLE "actors" ADD CONSTRAINT "actors_user_agent_id_user_agents_id_fk" FOREIGN KEY ("user_agent_id") REFERENCES "public"."user_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agent_home_device_owner_fk" FOREIGN KEY ("user_id","home_device_id") REFERENCES "public"."desktop_devices"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agent_picture_file_owner_fk" FOREIGN KEY ("image_file_id","user_id","picture_purpose") REFERENCES "public"."stored_files"("id","owner_user_id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_devices" ADD CONSTRAINT "desktop_devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD CONSTRAINT "contact_identifiers_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_grants" ADD CONSTRAINT "entity_grants_organization_id_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_grants" ADD CONSTRAINT "entity_grants_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_access_parents" ADD CONSTRAINT "entity_access_parents_organization_id_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_access_parents" ADD CONSTRAINT "entity_access_parents_organization_id_parent_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","parent_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_organization_id_source_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","source_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_organization_id_target_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","target_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_organization_id_created_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","created_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_author_organization_id_author_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("author_organization_id","author_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_author_actor_entity_id_messaging_participants_conversation_id_actor_entity_id_fk" FOREIGN KEY ("conversation_id","author_actor_entity_id") REFERENCES "public"."messaging_participants"("conversation_id","actor_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_thread_root_fk" FOREIGN KEY ("conversation_id","thread_id","thread_root") REFERENCES "public"."messaging_messages"("conversation_id","id","is_root") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_organization_id_actor_entity_id_actor_type_actors_organization_id_entity_id_type_fk" FOREIGN KEY ("organization_id","actor_entity_id","actor_type") REFERENCES "public"."actors"("organization_id","entity_id","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_reactions" ADD CONSTRAINT "messaging_reactions_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_reactions" ADD CONSTRAINT "messaging_reactions_conversation_id_actor_entity_id_messaging_participants_conversation_id_actor_entity_id_fk" FOREIGN KEY ("conversation_id","actor_entity_id") REFERENCES "public"."messaging_participants"("conversation_id","actor_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_project_entity_id_projects_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","project_entity_id") REFERENCES "public"."projects"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_project_entity_id_entity_access_parents_organization_id_entity_id_parent_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","project_entity_id") REFERENCES "public"."entity_access_parents"("organization_id","entity_id","parent_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_project_entity_id_parent_task_entity_id_tasks_organization_id_project_entity_id_entity_id_fk" FOREIGN KEY ("organization_id","project_entity_id","parent_task_entity_id") REFERENCES "public"."tasks"("organization_id","project_entity_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_assignee_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","assignee_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organization_id_author_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","author_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_organization_id_conversation_id_messaging_conversations_organization_id_id_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."messaging_conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_organization_id_created_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","created_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_messaging_references" ADD CONSTRAINT "message_messaging_references_organization_id_conversation_id_messaging_conversations_organization_id_id_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."messaging_conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_messaging_references" ADD CONSTRAINT "message_messaging_references_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_messaging_references" ADD CONSTRAINT "message_messaging_references_organization_id_target_conversation_id_messaging_conversations_organization_id_id_fk" FOREIGN KEY ("organization_id","target_conversation_id") REFERENCES "public"."messaging_conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_messaging_references" ADD CONSTRAINT "message_messaging_references_target_conversation_id_target_thread_id_thread_root_messaging_messages_conversation_id_id_is_root_fk" FOREIGN KEY ("target_conversation_id","target_thread_id","thread_root") REFERENCES "public"."messaging_messages"("conversation_id","id","is_root") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_task_requests" ADD CONSTRAINT "source_task_requests_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_task_requests" ADD CONSTRAINT "source_task_requests_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_source_message_id_messaging_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messaging_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_message_id_messaging_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messaging_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_recipient_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","recipient_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_requests" ADD CONSTRAINT "agent_tool_requests_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_triggers" ADD CONSTRAINT "user_agent_triggers_user_agent_id_user_agents_id_fk" FOREIGN KEY ("user_agent_id") REFERENCES "public"."user_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_requests" ADD CONSTRAINT "agent_run_requests_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_requests" ADD CONSTRAINT "agent_run_requests_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_agent_id_user_agents_id_fk" FOREIGN KEY ("user_agent_id") REFERENCES "public"."user_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_agent_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_thread_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","thread_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_owner_user_id_device_id_desktop_devices_user_id_id_fk" FOREIGN KEY ("owner_user_id","device_id") REFERENCES "public"."desktop_devices"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "file_upload_expiry_idx" ON "file_uploads" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "messaging_message_timeline_idx" ON "messaging_messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messaging_participants_actor_idx" ON "messaging_participants" USING btree ("actor_entity_id");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("organization_id","project_entity_id");--> statement-breakpoint
CREATE INDEX "task_comments_timeline_idx" ON "task_comments" USING btree ("organization_id","task_entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "message_reference_target_idx" ON "message_entity_references" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE INDEX "messaging_reference_target_idx" ON "message_messaging_references" USING btree ("organization_id","target_conversation_id","target_thread_id");--> statement-breakpoint
CREATE INDEX "task_activity_timeline_idx" ON "task_activity" USING btree ("organization_id","task_entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "notification_recipient_idx" ON "notifications" USING btree ("organization_id","recipient_actor_entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "agent_run_triggers_message_idx" ON "agent_run_triggers" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_queued_thread_unique" ON "agent_runs" USING btree ("agent_actor_entity_id","thread_id") WHERE "agent_runs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "agent_runs_owner_status_idx" ON "agent_runs" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "agent_runs_conversation_idx" ON "agent_runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_thread_idx" ON "agent_runs" USING btree ("agent_actor_entity_id","thread_id","created_at");