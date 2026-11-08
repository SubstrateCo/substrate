-- Desktop devices and agent home devices.
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
ALTER TABLE "desktop_devices" ADD CONSTRAINT "desktop_devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_agents" ADD COLUMN "home_device_id" uuid;
--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agent_home_device_owner_fk" FOREIGN KEY ("user_id","home_device_id") REFERENCES "public"."desktop_devices"("user_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Backfill: every existing participant needs a human actor in their own organization.
WITH missing AS MATERIALIZED (
	SELECT d.organization_id, d.user_id, d.name, gen_random_uuid() AS entity_id
	FROM (
		SELECT DISTINCT p.organization_id, p.user_id, u.name
		FROM "messaging_participants" p
		JOIN "user" u ON u.id = p.user_id
		WHERE NOT EXISTS (
			SELECT 1 FROM "actors" a WHERE a.organization_id = p.organization_id AND a.user_id = p.user_id
		)
	) d
), created_entities AS (
	INSERT INTO "entities" ("entity_id", "organization_id", "entity_type")
	SELECT entity_id, organization_id, 'actor' FROM missing
	RETURNING "entity_id"
), created_actors AS (
	INSERT INTO "actors" ("entity_id", "organization_id", "type", "user_id", "name")
	SELECT m.entity_id, m.organization_id, 'human', m.user_id, m.name
	FROM missing m JOIN created_entities e ON e.entity_id = m.entity_id
	RETURNING "entity_id", "organization_id"
)
INSERT INTO "entity_grants" ("organization_id", "entity_id", "actor_entity_id", "level")
SELECT organization_id, entity_id, entity_id, 'owner' FROM created_actors;
--> statement-breakpoint

-- Participants move from user IDs to actor IDs.
ALTER TABLE "messaging_participants" ADD COLUMN "actor_entity_id" uuid;
--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD COLUMN "actor_type" "actor_type";
--> statement-breakpoint
UPDATE "messaging_participants" p
SET "actor_entity_id" = a.entity_id, "actor_type" = 'human'
FROM "actors" a
WHERE a.organization_id = p.organization_id AND a.user_id = p.user_id AND a.type = 'human';
--> statement-breakpoint

-- Messages written before actor attribution get their author's actor.
UPDATE "messaging_messages" m
SET "author_actor_entity_id" = p.actor_entity_id, "author_organization_id" = p.organization_id
FROM "messaging_participants" p
WHERE m.author_actor_entity_id IS NULL AND p.conversation_id = m.conversation_id AND p.user_id = m.author_id;
--> statement-breakpoint

-- Reactions move to actor IDs.
ALTER TABLE "messaging_reactions" ADD COLUMN "actor_entity_id" uuid;
--> statement-breakpoint
UPDATE "messaging_reactions" r
SET "actor_entity_id" = p.actor_entity_id
FROM "messaging_participants" p
WHERE p.conversation_id = r.conversation_id AND p.user_id = r.user_id;
--> statement-breakpoint

ALTER TABLE "messaging_messages" DROP CONSTRAINT "messaging_messages_conversation_id_agent_author_entity_id_messaging_agent_participants_conversation_id_actor_entity_id_fk";
--> statement-breakpoint
ALTER TABLE "messaging_messages" DROP CONSTRAINT "messaging_messages_conversation_id_author_id_messaging_participants_conversation_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "messaging_reactions" DROP CONSTRAINT "messaging_reactions_conversation_id_user_id_messaging_participants_conversation_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "messaging_messages" DROP COLUMN "agent_author_entity_id";
--> statement-breakpoint

-- user_id is removed below; it must stop being the key before agent rows can be added.
ALTER TABLE "messaging_participants" DROP CONSTRAINT "messaging_participants_conversation_id_user_id_pk";
--> statement-breakpoint
ALTER TABLE "messaging_participants" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
-- Agents that wrote become members who left: authorship stays, membership does not.
INSERT INTO "messaging_participants" ("conversation_id", "organization_id", "user_id", "actor_entity_id", "actor_type", "left_at")
SELECT conversation_id, organization_id, NULL, actor_entity_id, 'agent', now()
FROM "messaging_agent_participants";
--> statement-breakpoint
DROP TABLE "messaging_agent_participants";
--> statement-breakpoint
ALTER TABLE "messaging_participants" DROP CONSTRAINT "messaging_participants_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "messaging_participants_user_idx";
--> statement-breakpoint
ALTER TABLE "messaging_participants" DROP COLUMN "user_id";
--> statement-breakpoint
ALTER TABLE "messaging_participants" ALTER COLUMN "actor_entity_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "messaging_participants" ALTER COLUMN "actor_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_conversation_id_actor_entity_id_pk" PRIMARY KEY("conversation_id","actor_entity_id");
--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_organization_id_actor_entity_id_actor_type_actors_organization_id_entity_id_type_fk" FOREIGN KEY ("organization_id","actor_entity_id","actor_type") REFERENCES "public"."actors"("organization_id","entity_id","type") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "messaging_participants_actor_idx" ON "messaging_participants" USING btree ("actor_entity_id");
--> statement-breakpoint

ALTER TABLE "messaging_messages" ALTER COLUMN "author_actor_entity_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "messaging_messages" ALTER COLUMN "author_organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_author_actor_entity_id_messaging_participants_conversation_id_actor_entity_id_fk" FOREIGN KEY ("conversation_id","author_actor_entity_id") REFERENCES "public"."messaging_participants"("conversation_id","actor_entity_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "messaging_reactions" DROP CONSTRAINT "messaging_reactions_message_id_user_id_emoji_pk";
--> statement-breakpoint
ALTER TABLE "messaging_reactions" DROP COLUMN "user_id";
--> statement-breakpoint
ALTER TABLE "messaging_reactions" ALTER COLUMN "actor_entity_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "messaging_reactions" ADD CONSTRAINT "messaging_reactions_message_id_actor_entity_id_emoji_pk" PRIMARY KEY("message_id","actor_entity_id","emoji");
--> statement-breakpoint
ALTER TABLE "messaging_reactions" ADD CONSTRAINT "messaging_reactions_conversation_id_actor_entity_id_messaging_participants_conversation_id_actor_entity_id_fk" FOREIGN KEY ("conversation_id","actor_entity_id") REFERENCES "public"."messaging_participants"("conversation_id","actor_entity_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Agent triggers and runs.
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
ALTER TABLE "user_agent_triggers" ADD CONSTRAINT "user_agent_triggers_user_agent_id_user_agents_id_fk" FOREIGN KEY ("user_agent_id") REFERENCES "public"."user_agents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_agent_id_user_agents_id_fk" FOREIGN KEY ("user_agent_id") REFERENCES "public"."user_agents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_agent_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_thread_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","thread_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_owner_user_id_device_id_desktop_devices_user_id_id_fk" FOREIGN KEY ("owner_user_id","device_id") REFERENCES "public"."desktop_devices"("user_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_requests" ADD CONSTRAINT "agent_run_requests_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_requests" ADD CONSTRAINT "agent_run_requests_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "agent_run_triggers_message_idx" ON "agent_run_triggers" USING btree ("message_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_queued_thread_unique" ON "agent_runs" USING btree ("agent_actor_entity_id","thread_id") WHERE "agent_runs"."status" = 'queued';
--> statement-breakpoint
CREATE INDEX "agent_runs_owner_status_idx" ON "agent_runs" USING btree ("owner_user_id","status");
--> statement-breakpoint
CREATE INDEX "agent_runs_conversation_idx" ON "agent_runs" USING btree ("conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX "agent_runs_thread_idx" ON "agent_runs" USING btree ("agent_actor_entity_id","thread_id","created_at");
