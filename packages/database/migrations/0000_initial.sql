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
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_agents_owner_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "user_agent_picture_purpose" CHECK ("user_agents"."picture_purpose" = 'avatar')
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
CREATE TABLE "organization_pictures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	"purpose" text DEFAULT 'organization-logo' NOT NULL,
	CONSTRAINT "organization_pictures_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "organization_picture_purpose" CHECK ("organization_pictures"."purpose" = 'organization-logo')
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
CREATE TABLE "user_pictures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	"purpose" text DEFAULT 'avatar' NOT NULL,
	CONSTRAINT "user_pictures_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_picture_purpose" CHECK ("user_pictures"."purpose" = 'avatar')
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
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"request_id" uuid,
	"thread_id" uuid,
	"is_root" boolean GENERATED ALWAYS AS (thread_id IS NULL) STORED,
	"thread_root" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_message_conversation_unique" UNIQUE("conversation_id","id"),
	CONSTRAINT "messaging_message_request_unique" UNIQUE("author_id","request_id"),
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
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agent_picture_file_owner_fk" FOREIGN KEY ("image_file_id","user_id","picture_purpose") REFERENCES "public"."stored_files"("id","owner_user_id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "organization_pictures" ADD CONSTRAINT "organization_pictures_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_pictures" ADD CONSTRAINT "organization_picture_file_owner_fk" FOREIGN KEY ("file_id","organization_id","purpose") REFERENCES "public"."stored_files"("id","organization_id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pictures" ADD CONSTRAINT "user_pictures_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pictures" ADD CONSTRAINT "user_picture_file_owner_fk" FOREIGN KEY ("file_id","user_id","purpose") REFERENCES "public"."stored_files"("id","owner_user_id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "source_task_requests" ADD CONSTRAINT "source_task_requests_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_task_requests" ADD CONSTRAINT "source_task_requests_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_source_message_id_messaging_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messaging_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_message_id_messaging_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messaging_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_recipient_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","recipient_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "messaging_participants_user_idx" ON "messaging_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("organization_id","project_entity_id");--> statement-breakpoint
CREATE INDEX "task_comments_timeline_idx" ON "task_comments" USING btree ("organization_id","task_entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "message_reference_target_idx" ON "message_entity_references" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE INDEX "task_activity_timeline_idx" ON "task_activity" USING btree ("organization_id","task_entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "notification_recipient_idx" ON "notifications" USING btree ("organization_id","recipient_actor_entity_id","created_at","id");
--> statement-breakpoint
CREATE FUNCTION sync_user_picture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE managed_file_id uuid;
BEGIN
  IF NEW.image IS NULL THEN
    DELETE FROM user_pictures WHERE user_id = NEW.id;
  ELSE
    managed_file_id := substring(NEW.image FROM '^/api/v1/files/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/content$')::uuid;
    IF managed_file_id IS NULL THEN
      RAISE EXCEPTION 'User pictures require a managed file URL' USING ERRCODE = '23514';
    END IF;
    INSERT INTO user_pictures (id, user_id, file_id, purpose)
      VALUES (gen_random_uuid(), NEW.id, managed_file_id, 'avatar')
      ON CONFLICT (user_id) DO UPDATE SET file_id = EXCLUDED.file_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER user_picture_sync AFTER INSERT OR UPDATE OF image ON "user"
FOR EACH ROW EXECUTE FUNCTION sync_user_picture();
--> statement-breakpoint
CREATE FUNCTION sync_organization_picture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE managed_file_id uuid;
BEGIN
  IF NEW.logo IS NULL THEN
    DELETE FROM organization_pictures WHERE organization_id = NEW.id;
  ELSE
    managed_file_id := substring(NEW.logo FROM '^/api/v1/files/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/content$')::uuid;
    IF managed_file_id IS NULL THEN
      RAISE EXCEPTION 'Organization pictures require a managed file URL' USING ERRCODE = '23514';
    END IF;
    INSERT INTO organization_pictures (id, organization_id, file_id, purpose)
      VALUES (gen_random_uuid(), NEW.id, managed_file_id, 'organization-logo')
      ON CONFLICT (organization_id) DO UPDATE SET file_id = EXCLUDED.file_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER organization_picture_sync AFTER INSERT OR UPDATE OF logo ON organization
FOR EACH ROW EXECUTE FUNCTION sync_organization_picture();
