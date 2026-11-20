CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('actor', 'contact', 'contact_interaction', 'project', 'task', 'account', 'deal');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."contact_identifier_type" AS ENUM('email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."contact_interaction_kind" AS ENUM('email', 'meeting', 'call', 'message', 'note', 'other');--> statement-breakpoint
CREATE TYPE "public"."contact_interaction_origin" AS ENUM('manual', 'message_publication');--> statement-breakpoint
CREATE TYPE "public"."permission_level" AS ENUM('view', 'comment', 'edit', 'owner');--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('related_to', 'blocks', 'duplicates');--> statement-breakpoint
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
	"access_entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entities_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "entities_organization_entity_type_unique" UNIQUE("organization_id","entity_id","entity_type"),
	CONSTRAINT "entities_organization_entity_access_unique" UNIQUE("organization_id","entity_id","access_entity_id")
);
--> statement-breakpoint
CREATE TABLE "actors" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('actor'::entity_type) STORED NOT NULL,
	"type" "actor_type" NOT NULL,
	"user_id" text,
	"user_agent_id" uuid,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "actors_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "actors_organization_entity_type_unique" UNIQUE("organization_id","entity_id","type"),
	CONSTRAINT "actors_organization_user_unique" UNIQUE("organization_id","user_id"),
	CONSTRAINT "actors_organization_user_agent_unique" UNIQUE("organization_id","user_agent_id"),
	CONSTRAINT "actors_organization_entity_user_agent_unique" UNIQUE("organization_id","entity_id","user_agent_id"),
	CONSTRAINT "actors_organization_entity_user_unique" UNIQUE("organization_id","entity_id","user_id"),
	CONSTRAINT "actors_identity_check" CHECK (("actors"."type" = 'human' AND "actors"."user_id" IS NOT NULL) OR ("actors"."type" = 'agent' AND "actors"."user_id" IS NULL)),
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
	"caller_policy" text DEFAULT 'owner' NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_agents_owner_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "user_agent_caller_policy_check" CHECK ("user_agents"."caller_policy" IN ('owner', 'anyone', 'ask')),
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
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"type" "contact_identifier_type" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text,
	"label" text,
	"extension" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_identifiers_value_check" CHECK (length(trim("contact_identifiers"."value")) > 0),
	CONSTRAINT "contact_identifiers_extension_check" CHECK ("contact_identifiers"."extension" IS NULL OR ("contact_identifiers"."type" = 'phone' AND "contact_identifiers"."extension" ~ '^[0-9]+$'))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('contact'::entity_type) STORED NOT NULL,
	"display_name" text NOT NULL,
	"given_name" text,
	"middle_name" text,
	"family_name" text,
	"name_prefix" text,
	"name_suffix" text,
	"nickname" text,
	"notes" text,
	CONSTRAINT "contacts_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "contacts_name_check" CHECK (length(trim("contacts"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "contact_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"street_address" text,
	"extended_address" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country_code" text,
	"formatted_address" text,
	CONSTRAINT "contact_addresses_nonempty_check" CHECK (length(trim(concat_ws('', "contact_addresses"."street_address", "contact_addresses"."extended_address", "contact_addresses"."city", "contact_addresses"."region", "contact_addresses"."postal_code", "contact_addresses"."country_code", "contact_addresses"."formatted_address"))) > 0),
	CONSTRAINT "contact_addresses_country_check" CHECK ("contact_addresses"."country_code" IS NULL OR "contact_addresses"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "contact_urls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "contact_urls_scheme_check" CHECK ("contact_urls"."url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "contact_interactions" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"kind" "contact_interaction_kind" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"summary" text NOT NULL,
	"origin" "contact_interaction_origin" NOT NULL,
	"created_by_actor_entity_id" uuid NOT NULL,
	CONSTRAINT "contact_interactions_org_entity_contact_unique" UNIQUE("organization_id","entity_id","contact_entity_id"),
	CONSTRAINT "contact_interactions_type_check" CHECK ("contact_interactions"."entity_type"::text = 'contact_interaction'),
	CONSTRAINT "contact_interactions_summary_check" CHECK (length(trim("contact_interactions"."summary")) > 0),
	CONSTRAINT "contact_interactions_time_check" CHECK ("contact_interactions"."ended_at" IS NULL OR "contact_interactions"."ended_at" >= "contact_interactions"."occurred_at")
);
--> statement-breakpoint
CREATE TABLE "entity_grants" (
	"organization_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"access_entity_id" uuid GENERATED ALWAYS AS (entity_id) STORED NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"actor_type" "actor_type" GENERATED ALWAYS AS ('human'::actor_type) STORED NOT NULL,
	"level" "permission_level" NOT NULL,
	CONSTRAINT "entity_grants_organization_id_entity_id_actor_entity_id_pk" PRIMARY KEY("organization_id","entity_id","actor_entity_id")
);
--> statement-breakpoint
CREATE TABLE "entity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"relation_type" "relation_type" NOT NULL,
	"created_by_actor_entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_links_pair_unique" UNIQUE("organization_id","source_entity_id","target_entity_id","relation_type"),
	CONSTRAINT "entity_links_no_self_link" CHECK ("entity_links"."source_entity_id" <> "entity_links"."target_entity_id"),
	CONSTRAINT "entity_links_related_order" CHECK ("entity_links"."relation_type"::text <> 'related_to' OR "entity_links"."source_entity_id" < "entity_links"."target_entity_id")
);
--> statement-breakpoint
CREATE TABLE "idempotent_requests" (
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotent_requests_organization_id_actor_entity_id_operation_request_id_pk" PRIMARY KEY("organization_id","actor_entity_id","operation","request_id"),
	CONSTRAINT "idempotent_request_operation" CHECK (operation in ('account', 'deal', 'deal_transition', 'crm_from_message', 'crm_follow_up', 'task_from_message'))
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
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_files_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "stored_file_user_purpose" UNIQUE("id","owner_user_id","purpose"),
	CONSTRAINT "stored_file_organization_purpose" UNIQUE("organization_id","id","purpose"),
	CONSTRAINT "stored_file_owner" CHECK (("stored_files"."purpose" = 'avatar' AND "stored_files"."owner_user_id" IS NOT NULL AND "stored_files"."organization_id" IS NULL AND "stored_files"."uploaded_by" = "stored_files"."owner_user_id") OR ("stored_files"."purpose" IN ('organization-logo', 'file') AND "stored_files"."organization_id" IS NOT NULL AND "stored_files"."owner_user_id" IS NULL)),
	CONSTRAINT "stored_file_size" CHECK ("stored_files"."size" > 0 AND "stored_files"."size" <= 5242880),
	CONSTRAINT "stored_file_image_type" CHECK ("stored_files"."purpose" = 'file' OR "stored_files"."content_type" = 'image/webp')
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_organization_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	"file_purpose" text DEFAULT 'file' NOT NULL,
	"added_by_actor_entity_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	CONSTRAINT "message_attachment_file_unique" UNIQUE("message_id","file_id"),
	CONSTRAINT "message_attachment_purpose" CHECK ("message_attachments"."file_purpose" = 'file'),
	CONSTRAINT "message_attachment_position" CHECK ("message_attachments"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "task_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_organization_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	"file_purpose" text DEFAULT 'file' NOT NULL,
	"added_by_actor_entity_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" text NOT NULL,
	"task_entity_id" uuid NOT NULL,
	CONSTRAINT "task_attachment_file_unique" UNIQUE("task_entity_id","file_id"),
	CONSTRAINT "task_attachment_organization" CHECK ("task_attachments"."organization_id" = "task_attachments"."file_organization_id"),
	CONSTRAINT "task_attachment_purpose" CHECK ("task_attachments"."file_purpose" = 'file'),
	CONSTRAINT "task_attachment_position" CHECK ("task_attachments"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "messaging_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"task_entity_id" uuid,
	"dm_key" text,
	"name" text,
	"private" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_conversation_organization_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "messaging_conversation_task_unique" UNIQUE("task_entity_id"),
	CONSTRAINT "messaging_task_discussion_check" CHECK ("messaging_conversations"."task_entity_id" IS NULL OR ("messaging_conversations"."kind" = 'group' AND "messaging_conversations"."private" AND "messaging_conversations"."dm_key" IS NULL)),
	CONSTRAINT "messaging_kind_check" CHECK ("messaging_conversations"."kind" IN ('dm', 'group', 'channel')),
	CONSTRAINT "messaging_visibility_check" CHECK ("messaging_conversations"."kind" = 'channel' OR "messaging_conversations"."private"),
	CONSTRAINT "messaging_channel_name_check" CHECK ("messaging_conversations"."kind" <> 'channel' OR length(trim("messaging_conversations"."name")) > 0 AND "messaging_conversations"."name" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "messaging_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_actor_entity_id" uuid NOT NULL,
	"author_organization_id" text NOT NULL,
	"body" text NOT NULL,
	"request_id" uuid,
	"thread_id" uuid,
	"is_root" boolean GENERATED ALWAYS AS (thread_id IS NULL) STORED,
	"thread_root" boolean DEFAULT true NOT NULL,
	"origin_turn_id" uuid,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_message_conversation_unique" UNIQUE("conversation_id","id"),
	CONSTRAINT "messaging_message_author_unique" UNIQUE("conversation_id","id","author_organization_id","author_actor_entity_id"),
	CONSTRAINT "messaging_actor_message_request_unique" UNIQUE("author_actor_entity_id","request_id"),
	CONSTRAINT "messaging_message_root_unique" UNIQUE("conversation_id","id","is_root"),
	CONSTRAINT "messaging_thread_root_check" CHECK ("messaging_messages"."thread_root"),
	CONSTRAINT "messaging_body_check" CHECK (length("messaging_messages"."body") <= 20000),
	CONSTRAINT "messaging_deleted_body_check" CHECK ("messaging_messages"."deleted_at" IS NULL OR "messaging_messages"."body" = '')
);
--> statement-breakpoint
CREATE TABLE "messaging_participants" (
	"conversation_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"consented_at" timestamp with time zone,
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
CREATE TABLE "messaging_connections" (
	"conversation_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone,
	CONSTRAINT "messaging_connections_conversation_id_organization_id_pk" PRIMARY KEY("conversation_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "messaging_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"host_organization_id" text NOT NULL,
	"sender_organization_id" text NOT NULL,
	"inviter_id" text NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"target_organization_id" text,
	"recipient_user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"next_delivery_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_invitation_status_check" CHECK ("messaging_invitations"."status" IN ('pending', 'accepted', 'declined', 'revoked')),
	CONSTRAINT "messaging_invitation_purpose_check" CHECK ("messaging_invitations"."purpose" IN ('organization', 'person'))
);
--> statement-breakpoint
CREATE TABLE "messaging_sharing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_organization_id" text,
	"invitation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('project'::entity_type) STORED NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image" text,
	CONSTRAINT "projects_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "projects_name_check" CHECK (length(trim("projects"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "projects_image_check" CHECK ("projects"."image" IS NULL OR "projects"."image" ~ ('^/api/v1/files/pictures/project-icon/' || "projects"."entity_id"::text || '[?]v=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
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
	CONSTRAINT "message_reference_type_check" CHECK ("message_entity_references"."entity_type"::text IN ('task', 'project', 'contact', 'account', 'deal', 'contact_interaction')),
	CONSTRAINT "message_reference_purpose_check" CHECK ("message_entity_references"."purpose" IN ('source', 'mention', 'association'))
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
	CONSTRAINT "notification_kind_check" CHECK ("notifications"."kind" IN ('assignment', 'mention', 'reply', 'message'))
);
--> statement-breakpoint
CREATE TABLE "agent_tool_requests" (
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"turn_id" uuid,
	"attempt" integer,
	CONSTRAINT "agent_tool_requests_organization_id_actor_entity_id_tool_request_id_pk" PRIMARY KEY("organization_id","actor_entity_id","tool","request_id")
);
--> statement-breakpoint
CREATE TABLE "user_agent_triggers" (
	"user_agent_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_agent_triggers_user_agent_id_kind_pk" PRIMARY KEY("user_agent_id","kind"),
	CONSTRAINT "user_agent_trigger_kind_check" CHECK ("user_agent_triggers"."kind" IN ('direct_message', 'mention', 'thread_reply'))
);
--> statement-breakpoint
CREATE TABLE "user_agent_callers" (
	"organization_id" text NOT NULL,
	"user_agent_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"caller_user_id" text NOT NULL,
	"caller_actor_entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_agent_callers_user_agent_id_organization_id_caller_user_id_pk" PRIMARY KEY("user_agent_id","organization_id","caller_user_id")
);
--> statement-breakpoint
CREATE TABLE "agent_wakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_agent_id" uuid NOT NULL,
	"agent_actor_entity_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" jsonb NOT NULL,
	"session_key" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acked_at" timestamp with time zone,
	CONSTRAINT "agent_wakes_dedupe_unique" UNIQUE("user_agent_id","dedupe_key"),
	CONSTRAINT "agent_wake_source_check" CHECK ("agent_wakes"."source" IN ('owner_message', 'answer', 'approval_result', 'caller_message')),
	CONSTRAINT "agent_wake_session_key_check" CHECK (length("agent_wakes"."session_key") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "agent_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_agent_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"agent_actor_entity_id" uuid NOT NULL,
	"session_key" text NOT NULL,
	"turn_id" uuid NOT NULL,
	"epoch" integer,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"native_request_id" text,
	"anchor_message_id" uuid,
	"conversation_id" uuid,
	"thread_id" uuid,
	"payload" jsonb NOT NULL,
	"proposed_action" jsonb,
	"action_hash" text,
	"target_basis" jsonb,
	"response" jsonb,
	"outcome" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "agent_request_kind_check" CHECK ("agent_requests"."kind" IN ('permission', 'question', 'proposal')),
	CONSTRAINT "agent_request_mode_check" CHECK ("agent_requests"."mode" IN ('blocking', 'async')),
	CONSTRAINT "agent_request_status_check" CHECK ("agent_requests"."status" IN ('pending', 'resolved', 'delivered', 'executing', 'executed', 'failed', 'cancelled', 'expired', 'orphaned', 'undelivered')),
	CONSTRAINT "agent_request_blocking_check" CHECK ("agent_requests"."mode" <> 'blocking' OR "agent_requests"."native_request_id" IS NOT NULL),
	CONSTRAINT "agent_request_proposal_check" CHECK (("agent_requests"."kind" = 'proposal') = ("agent_requests"."proposed_action" IS NOT NULL AND "agent_requests"."action_hash" IS NOT NULL) AND ("agent_requests"."kind" <> 'proposal' OR "agent_requests"."mode" = 'async')),
	CONSTRAINT "agent_request_place_check" CHECK ("agent_requests"."conversation_id" IS NOT NULL OR ("agent_requests"."anchor_message_id" IS NULL AND "agent_requests"."thread_id" IS NULL)),
	CONSTRAINT "agent_request_session_key_check" CHECK (length("agent_requests"."session_key") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "agent_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_agent_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" text,
	"invocation_id" uuid,
	"caller_user_id" text,
	"tool" text,
	"access" text,
	"target_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" text,
	"turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_audit_action_check" CHECK ("agent_audit_events"."action" IN ('policy_changed', 'caller_allowed', 'caller_removed', 'invocation_admitted', 'invocation_held', 'invocation_rate_limited', 'invocation_approved', 'invocation_declined', 'invocation_expired', 'invocation_cancelled', 'invocation_dropped', 'mcp_call')),
	CONSTRAINT "agent_audit_access_check" CHECK ("agent_audit_events"."access" IS NULL OR "agent_audit_events"."access" IN ('read', 'write'))
);
--> statement-breakpoint
CREATE TABLE "agent_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_agent_id" uuid NOT NULL,
	"agent_actor_entity_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"caller_user_id" text NOT NULL,
	"caller_actor_entity_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"thread_id" uuid,
	"kind" text NOT NULL,
	"policy" text NOT NULL,
	"allowlisted" boolean NOT NULL,
	"status" text NOT NULL,
	"drop_reason" text,
	"session_key" text NOT NULL,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"wake_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_invocations_message_unique" UNIQUE("user_agent_id","message_id"),
	CONSTRAINT "agent_invocation_status_check" CHECK ("agent_invocations"."status" IN ('received', 'pending_approval', 'admitted', 'rate_limited', 'declined', 'expired', 'cancelled', 'dropped')),
	CONSTRAINT "agent_invocation_drop_reason_check" CHECK ("agent_invocations"."drop_reason" IS NULL OR "agent_invocations"."drop_reason" IN ('revoked', 'desktop_needs_update')),
	CONSTRAINT "agent_invocation_kind_check" CHECK ("agent_invocations"."kind" IN ('mention', 'thread_reply')),
	CONSTRAINT "agent_invocation_policy_check" CHECK ("agent_invocations"."policy" IN ('owner', 'anyone', 'ask')),
	CONSTRAINT "agent_invocation_caller_check" CHECK ("agent_invocations"."caller_user_id" <> "agent_invocations"."owner_user_id"),
	CONSTRAINT "agent_invocation_session_key_check" CHECK (length("agent_invocations"."session_key") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "agent_status" (
	"user_agent_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"state" text NOT NULL,
	"queued_count" integer DEFAULT 0 NOT NULL,
	"live_conversation_id" uuid,
	"live_thread_id" uuid,
	"activity" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" bigint NOT NULL,
	CONSTRAINT "agent_status_live_place_check" CHECK ("agent_status"."live_thread_id" IS NULL OR "agent_status"."live_conversation_id" IS NOT NULL),
	CONSTRAINT "agent_status_state_check" CHECK ("agent_status"."state" IN ('idle', 'working', 'queued', 'needs_you')),
	CONSTRAINT "agent_status_activity_check" CHECK ("agent_status"."activity" IS NULL OR length("agent_status"."activity") <= 200),
	CONSTRAINT "agent_status_queued_check" CHECK ("agent_status"."queued_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "messaging_read_positions" (
	"conversation_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"message_created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "messaging_read_positions_conversation_id_actor_entity_id_pk" PRIMARY KEY("conversation_id","actor_entity_id")
);
--> statement-breakpoint
CREATE TABLE "crm_accounts" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"domain" text,
	"summary" text DEFAULT '' NOT NULL,
	"owner_actor_entity_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "crm_accounts_organization_id_entity_id_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "crm_account_type" CHECK ("crm_accounts"."entity_type"::text = 'account'),
	CONSTRAINT "crm_account_name" CHECK (length(trim("crm_accounts"."name")) between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "crm_affiliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"account_entity_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "crm_affiliations_organization_id_contact_entity_id_account_entity_id_unique" UNIQUE("organization_id","contact_entity_id","account_entity_id")
);
--> statement-breakpoint
CREATE TABLE "crm_contact_profiles" (
	"organization_id" text NOT NULL,
	"contact_entity_id" uuid PRIMARY KEY NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_deal_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"deal_entity_id" uuid NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "crm_deal_contacts_organization_id_deal_entity_id_contact_entity_id_unique" UNIQUE("organization_id","deal_entity_id","contact_entity_id")
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"title" text NOT NULL,
	"account_entity_id" uuid,
	"owner_actor_entity_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"outcome" text DEFAULT 'open' NOT NULL,
	"amount" numeric(19, 4),
	"currency" text,
	"expected_close_date" date,
	"closed_at" timestamp with time zone,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"lost_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "crm_deals_organization_id_entity_id_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "crm_deal_type" CHECK ("crm_deals"."entity_type"::text = 'deal'),
	CONSTRAINT "crm_deal_money" CHECK (("crm_deals"."amount" is null and "crm_deals"."currency" is null) or ("crm_deals"."amount" is not null and "crm_deals"."currency" is not null and "crm_deals"."amount" >= 0 and "crm_deals"."currency" ~ '^[A-Z]{3}$')),
	CONSTRAINT "crm_deal_outcome" CHECK ("crm_deals"."outcome" in ('open','won','lost') and (("crm_deals"."outcome" = 'open') = ("crm_deals"."closed_at" is null)))
);
--> statement-breakpoint
CREATE TABLE "crm_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"retired" boolean DEFAULT false NOT NULL,
	CONSTRAINT "crm_stages_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"default_currency" text,
	CONSTRAINT "crm_settings_currency" CHECK ("crm_settings"."default_currency" is null or "crm_settings"."default_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "crm_activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_activity_entity_type" CHECK ("crm_activity_events"."entity_type"::text in ('account', 'contact', 'deal')),
	CONSTRAINT "crm_activity_action" CHECK ("crm_activity_events"."action" in ('created', 'updated', 'stage_changed', 'owner_changed', 'discussion_linked', 'discussion_unlinked', 'context_linked', 'context_unlinked', 'interaction_created', 'interaction_updated', 'interaction_deleted', 'follow_up_created', 'shared', 'unshared', 'archived', 'restored')),
	CONSTRAINT "crm_activity_fields" CHECK (jsonb_typeof("crm_activity_events"."changed_fields") = 'array' and "crm_activity_events"."changed_fields" <@ '["name","website","domain","summary","displayName","givenName","familyName","notes","middleName","namePrefix","nameSuffix","nickname","title","account","contacts","primaryContact","stage","amount","currency","expectedCloseDate","outcome","lostReason","owner","identifier","address","url","affiliation","role","kind","occurredAt","endedAt","sharing"]'::jsonb)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_organization_id_access_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","access_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_user_agent_id_user_agents_id_fk" FOREIGN KEY ("user_agent_id") REFERENCES "public"."user_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agent_home_device_owner_fk" FOREIGN KEY ("user_id","home_device_id") REFERENCES "public"."desktop_devices"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agent_picture_file_owner_fk" FOREIGN KEY ("image_file_id","user_id","picture_purpose") REFERENCES "public"."stored_files"("id","owner_user_id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_devices" ADD CONSTRAINT "desktop_devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD CONSTRAINT "contact_identifiers_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_addresses" ADD CONSTRAINT "contact_addresses_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_urls" ADD CONSTRAINT "contact_urls_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_entity_id_contact_entity_id_entities_organization_id_entity_id_access_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","contact_entity_id") REFERENCES "public"."entities"("organization_id","entity_id","access_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_created_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","created_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_grants" ADD CONSTRAINT "entity_grants_container_fk" FOREIGN KEY ("organization_id","entity_id","access_entity_id") REFERENCES "public"."entities"("organization_id","entity_id","access_entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_grants" ADD CONSTRAINT "entity_grants_human_actor_fk" FOREIGN KEY ("organization_id","actor_entity_id","actor_type") REFERENCES "public"."actors"("organization_id","entity_id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_organization_id_source_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","source_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_organization_id_target_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","target_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_organization_id_created_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","created_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotent_requests" ADD CONSTRAINT "idempotent_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotent_requests" ADD CONSTRAINT "idempotent_request_actor_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotent_requests" ADD CONSTRAINT "idempotent_request_entity_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachment_author_fk" FOREIGN KEY ("conversation_id","message_id","file_organization_id","added_by_actor_entity_id") REFERENCES "public"."messaging_messages"("conversation_id","id","author_organization_id","author_actor_entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_organization_id_file_id_file_purpose_stored_files_organization_id_id_purpose_fk" FOREIGN KEY ("file_organization_id","file_id","file_purpose") REFERENCES "public"."stored_files"("organization_id","id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_organization_id_added_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("file_organization_id","added_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_file_organization_id_file_id_file_purpose_stored_files_organization_id_id_purpose_fk" FOREIGN KEY ("file_organization_id","file_id","file_purpose") REFERENCES "public"."stored_files"("organization_id","id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_file_organization_id_added_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("file_organization_id","added_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_author_organization_id_author_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("author_organization_id","author_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_author_actor_entity_id_messaging_participants_conversation_id_actor_entity_id_fk" FOREIGN KEY ("conversation_id","author_actor_entity_id") REFERENCES "public"."messaging_participants"("conversation_id","actor_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_thread_root_fk" FOREIGN KEY ("conversation_id","thread_id","thread_root") REFERENCES "public"."messaging_messages"("conversation_id","id","is_root") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_organization_id_actor_entity_id_actor_type_actors_organization_id_entity_id_type_fk" FOREIGN KEY ("organization_id","actor_entity_id","actor_type") REFERENCES "public"."actors"("organization_id","entity_id","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_reactions" ADD CONSTRAINT "messaging_reactions_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_reactions" ADD CONSTRAINT "messaging_reactions_conversation_id_actor_entity_id_messaging_participants_conversation_id_actor_entity_id_fk" FOREIGN KEY ("conversation_id","actor_entity_id") REFERENCES "public"."messaging_participants"("conversation_id","actor_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_connections" ADD CONSTRAINT "messaging_connections_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_connections" ADD CONSTRAINT "messaging_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_connections" ADD CONSTRAINT "messaging_connections_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_invitations" ADD CONSTRAINT "messaging_invitations_sender_organization_id_organization_id_fk" FOREIGN KEY ("sender_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_invitations" ADD CONSTRAINT "messaging_invitations_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_invitations" ADD CONSTRAINT "messaging_invitations_target_organization_id_organization_id_fk" FOREIGN KEY ("target_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_invitations" ADD CONSTRAINT "messaging_invitations_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_invitations" ADD CONSTRAINT "messaging_invitations_host_organization_id_conversation_id_messaging_conversations_organization_id_id_fk" FOREIGN KEY ("host_organization_id","conversation_id") REFERENCES "public"."messaging_conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_sharing_events" ADD CONSTRAINT "messaging_sharing_events_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_sharing_events" ADD CONSTRAINT "messaging_sharing_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_sharing_events" ADD CONSTRAINT "messaging_sharing_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_sharing_events" ADD CONSTRAINT "messaging_sharing_events_target_organization_id_organization_id_fk" FOREIGN KEY ("target_organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_sharing_events" ADD CONSTRAINT "messaging_sharing_events_invitation_id_messaging_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."messaging_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_project_entity_id_projects_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","project_entity_id") REFERENCES "public"."projects"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_project_entity_id_entities_organization_id_entity_id_access_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","project_entity_id") REFERENCES "public"."entities"("organization_id","entity_id","access_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_project_entity_id_parent_task_entity_id_tasks_organization_id_project_entity_id_entity_id_fk" FOREIGN KEY ("organization_id","project_entity_id","parent_task_entity_id") REFERENCES "public"."tasks"("organization_id","project_entity_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_assignee_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","assignee_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_organization_id_conversation_id_messaging_conversations_organization_id_id_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."messaging_conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_organization_id_created_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","created_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_source_message_id_messaging_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messaging_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_message_id_messaging_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messaging_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_recipient_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","recipient_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_requests" ADD CONSTRAINT "agent_tool_requests_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_triggers" ADD CONSTRAINT "user_agent_triggers_user_agent_id_user_agents_id_fk" FOREIGN KEY ("user_agent_id") REFERENCES "public"."user_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_callers" ADD CONSTRAINT "user_agent_callers_owner_user_id_user_agent_id_user_agents_user_id_id_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_callers" ADD CONSTRAINT "user_agent_callers_agent_fk" FOREIGN KEY ("organization_id","user_agent_id") REFERENCES "public"."actors"("organization_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_callers" ADD CONSTRAINT "user_agent_callers_caller_fk" FOREIGN KEY ("organization_id","caller_actor_entity_id","caller_user_id") REFERENCES "public"."actors"("organization_id","entity_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_callers" ADD CONSTRAINT "user_agent_callers_member_fk" FOREIGN KEY ("organization_id","caller_user_id") REFERENCES "public"."member"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_wakes" ADD CONSTRAINT "agent_wakes_owner_user_id_user_agent_id_user_agents_user_id_id_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_wakes" ADD CONSTRAINT "agent_wakes_organization_id_agent_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_wakes" ADD CONSTRAINT "agent_wakes_agent_actor_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id","user_agent_id") REFERENCES "public"."actors"("organization_id","entity_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_owner_user_id_user_agent_id_user_agents_user_id_id_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_organization_id_agent_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_agent_actor_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id","user_agent_id") REFERENCES "public"."actors"("organization_id","entity_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_conversation_id_anchor_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","anchor_message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_conversation_id_thread_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","thread_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_invocation_id_agent_invocations_id_fk" FOREIGN KEY ("invocation_id") REFERENCES "public"."agent_invocations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_caller_user_id_user_id_fk" FOREIGN KEY ("caller_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_owner_user_id_user_agent_id_user_agents_user_id_id_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_agent_fk" FOREIGN KEY ("organization_id","user_agent_id") REFERENCES "public"."actors"("organization_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_wake_id_agent_wakes_id_fk" FOREIGN KEY ("wake_id") REFERENCES "public"."agent_wakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_owner_user_id_user_agent_id_user_agents_user_id_id_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_agent_actor_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id","user_agent_id") REFERENCES "public"."actors"("organization_id","entity_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_caller_actor_fk" FOREIGN KEY ("organization_id","caller_actor_entity_id","caller_user_id") REFERENCES "public"."actors"("organization_id","entity_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_conversation_id_thread_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","thread_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_live_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("live_conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_owner_user_id_user_agent_id_user_agents_user_id_id_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_agent_actor_fk" FOREIGN KEY ("organization_id","user_agent_id") REFERENCES "public"."actors"("organization_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_live_thread_fk" FOREIGN KEY ("live_conversation_id","live_thread_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_read_positions" ADD CONSTRAINT "messaging_read_positions_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_read_positions" ADD CONSTRAINT "messaging_read_positions_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_organization_id_owner_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","owner_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_affiliations" ADD CONSTRAINT "crm_affiliations_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_affiliations" ADD CONSTRAINT "crm_affiliations_organization_id_account_entity_id_crm_accounts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","account_entity_id") REFERENCES "public"."crm_accounts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_profiles" ADD CONSTRAINT "crm_contact_profiles_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_contacts" ADD CONSTRAINT "crm_deal_contacts_organization_id_deal_entity_id_crm_deals_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","deal_entity_id") REFERENCES "public"."crm_deals"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_contacts" ADD CONSTRAINT "crm_deal_contacts_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_account_entity_id_crm_accounts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","account_entity_id") REFERENCES "public"."crm_accounts"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_owner_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","owner_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_stage_id_crm_stages_organization_id_id_fk" FOREIGN KEY ("organization_id","stage_id") REFERENCES "public"."crm_stages"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_settings" ADD CONSTRAINT "crm_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity_events" ADD CONSTRAINT "crm_activity_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity_events" ADD CONSTRAINT "crm_activity_entity_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity_events" ADD CONSTRAINT "crm_activity_actor_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity_events" ADD CONSTRAINT "crm_activity_related_fk" FOREIGN KEY ("organization_id","related_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "invitation_organization_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entities_organization_access_idx" ON "entities" USING btree ("organization_id","access_entity_id");--> statement-breakpoint
CREATE INDEX "actors_user_idx" ON "actors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_agents_image_file_idx" ON "user_agents" USING btree ("image_file_id") WHERE "user_agents"."image_file_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identifiers_value_unique" ON "contact_identifiers" USING btree ("organization_id","contact_entity_id","type",coalesce("normalized_value", "value"),coalesce("extension", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identifiers_primary_unique" ON "contact_identifiers" USING btree ("organization_id","contact_entity_id","type") WHERE "contact_identifiers"."is_primary";--> statement-breakpoint
CREATE INDEX "contact_identifiers_lookup_idx" ON "contact_identifiers" USING btree ("organization_id","type","normalized_value");--> statement-breakpoint
CREATE INDEX "contact_addresses_contact_idx" ON "contact_addresses" USING btree ("organization_id","contact_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_addresses_primary_unique" ON "contact_addresses" USING btree ("organization_id","contact_entity_id") WHERE "contact_addresses"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "contact_urls_value_unique" ON "contact_urls" USING btree ("organization_id","contact_entity_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_urls_primary_unique" ON "contact_urls" USING btree ("organization_id","contact_entity_id") WHERE "contact_urls"."is_primary";--> statement-breakpoint
CREATE INDEX "contact_interactions_timeline_idx" ON "contact_interactions" USING btree ("organization_id","contact_entity_id","occurred_at" DESC NULLS LAST,"entity_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entity_grants_actor_idx" ON "entity_grants" USING btree ("organization_id","actor_entity_id","entity_id");--> statement-breakpoint
CREATE INDEX "entity_links_target_idx" ON "entity_links" USING btree ("organization_id","target_entity_id");--> statement-breakpoint
CREATE INDEX "file_upload_expiry_idx" ON "file_uploads" USING btree ("expires_at") WHERE "file_uploads"."temporary_cleaned_at" IS NULL;--> statement-breakpoint
CREATE INDEX "file_upload_uploader_idx" ON "file_uploads" USING btree ("uploaded_by","expires_at") WHERE "file_uploads"."purpose" = 'file' AND "file_uploads"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "message_attachment_file_idx" ON "message_attachments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "task_attachment_file_idx" ON "task_attachments" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_conversations_dm_key_unique" ON "messaging_conversations" USING btree ("dm_key") WHERE "messaging_conversations"."dm_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "messaging_conversations_name_trgm_idx" ON "messaging_conversations" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "messaging_messages_search_idx" ON "messaging_messages" USING gin (to_tsvector('simple', regexp_replace("body", '[!-/:-@[-`{-~]', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "messaging_message_thread_idx" ON "messaging_messages" USING btree ("conversation_id","thread_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messaging_message_origin_turn_idx" ON "messaging_messages" USING btree ("origin_turn_id") WHERE "messaging_messages"."origin_turn_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "messaging_message_conversation_created_idx" ON "messaging_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messaging_message_unread_idx" ON "messaging_messages" USING btree ("conversation_id","created_at","id","author_actor_entity_id") WHERE "messaging_messages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "messaging_participants_actor_idx" ON "messaging_participants" USING btree ("actor_entity_id");--> statement-breakpoint
CREATE INDEX "messaging_reactions_participant_idx" ON "messaging_reactions" USING btree ("conversation_id","actor_entity_id");--> statement-breakpoint
CREATE INDEX "messaging_connection_organization_idx" ON "messaging_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "messaging_invitation_email_idx" ON "messaging_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "messaging_invitation_conversation_idx" ON "messaging_invitations" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messaging_invitation_sender_idx" ON "messaging_invitations" USING btree ("sender_organization_id","created_at");--> statement-breakpoint
CREATE INDEX "messaging_invitation_target_idx" ON "messaging_invitations" USING btree ("target_organization_id","status");--> statement-breakpoint
CREATE INDEX "messaging_invitation_recipient_idx" ON "messaging_invitations" USING btree ("recipient_user_id","status");--> statement-breakpoint
CREATE INDEX "messaging_invitation_delivery_idx" ON "messaging_invitations" USING btree ("next_delivery_at") WHERE "messaging_invitations"."status" = 'pending' AND "messaging_invitations"."delivered_at" IS NULL;--> statement-breakpoint
CREATE INDEX "messaging_sharing_event_conversation_idx" ON "messaging_sharing_events" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messaging_sharing_event_invitation_idx" ON "messaging_sharing_events" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "projects_search_idx" ON "projects" USING gin (to_tsvector('simple', regexp_replace("name" || ' ' || "description", '[!-/:-@[-`{-~]', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "projects_name_trgm_idx" ON "projects" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tasks_search_idx" ON "tasks" USING gin (to_tsvector('simple', regexp_replace("title" || ' ' || "description", '[!-/:-@[-`{-~]', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING gin (lower("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("organization_id","parent_task_entity_id") WHERE "tasks"."parent_task_entity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "message_reference_target_idx" ON "message_entity_references" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE INDEX "message_reference_conversation_idx" ON "message_entity_references" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "task_activity_timeline_idx" ON "task_activity" USING btree ("organization_id","task_entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "task_activity_source_message_idx" ON "task_activity" USING btree ("source_message_id") WHERE "task_activity"."source_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_recipient_idx" ON "notifications" USING btree ("organization_id","recipient_actor_entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "notification_unread_idx" ON "notifications" USING btree ("organization_id","recipient_actor_entity_id","created_at","id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notification_message_idx" ON "notifications" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "notification_read_created_idx" ON "notifications" USING btree ("created_at") WHERE "notifications"."read_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_entity_idx" ON "notifications" USING btree ("organization_id","entity_id") WHERE "notifications"."entity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_tool_requests_turn_idx" ON "agent_tool_requests" USING btree ("turn_id") WHERE "agent_tool_requests"."turn_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_wakes_pending_idx" ON "agent_wakes" USING btree ("user_agent_id","created_at","id") WHERE "agent_wakes"."acked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_requests_native_unique" ON "agent_requests" USING btree ("user_agent_id","turn_id","native_request_id") WHERE "agent_requests"."native_request_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_requests_owner_status_idx" ON "agent_requests" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "agent_requests_conversation_idx" ON "agent_requests" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_requests_turn_idx" ON "agent_requests" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "agent_audit_events_agent_idx" ON "agent_audit_events" USING btree ("user_agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_invocations_owner_status_idx" ON "agent_invocations" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "agent_invocations_caller_idx" ON "agent_invocations" USING btree ("user_agent_id","caller_user_id","status");--> statement-breakpoint
CREATE INDEX "agent_invocations_conversation_idx" ON "agent_invocations" USING btree ("conversation_id","caller_user_id");--> statement-breakpoint
CREATE INDEX "crm_affiliations_account_idx" ON "crm_affiliations" USING btree ("organization_id","account_entity_id");--> statement-breakpoint
CREATE INDEX "crm_deals_stage_idx" ON "crm_deals" USING btree ("organization_id","stage_id");--> statement-breakpoint
CREATE INDEX "crm_activity_page_idx" ON "crm_activity_events" USING btree ("organization_id","entity_id","created_at","id");