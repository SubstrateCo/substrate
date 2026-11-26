CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"user_agent_id" uuid NOT NULL,
	"agent_actor_entity_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"parent_session_id" uuid,
	"origin_conversation_id" uuid,
	"origin_thread_id" uuid,
	"destination_conversation_id" uuid,
	"destination_thread_id" uuid,
	"status" text DEFAULT 'idle' NOT NULL,
	"reset_generation" integer DEFAULT 0 NOT NULL,
	"reset_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_sessions_agent_key_unique" UNIQUE("user_agent_id","key"),
	CONSTRAINT "agent_sessions_agent_unique" UNIQUE("organization_id","user_agent_id","id"),
	CONSTRAINT "agent_sessions_key_check" CHECK (length("agent_sessions"."key") BETWEEN 1 AND 200),
	CONSTRAINT "agent_sessions_parent_check" CHECK (("agent_sessions"."kind" = 'helper') = ("agent_sessions"."parent_session_id" IS NOT NULL)),
	CONSTRAINT "agent_sessions_reset_check" CHECK ("agent_sessions"."reset_generation" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_turns" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"user_agent_id" uuid NOT NULL,
	"agent_actor_entity_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"folder_key" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"outcome" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"handoff" boolean DEFAULT false NOT NULL,
	"reset_generation" integer DEFAULT 0 NOT NULL,
	"error" text,
	"attention_reason" text,
	"interruption" text,
	"recoveries" integer DEFAULT 0 NOT NULL,
	"auto_continue" boolean DEFAULT true NOT NULL,
	"resumes_turn_id" uuid,
	"activity" text,
	"usage" jsonb,
	"source_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request_anchors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lease_device_id" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "agent_turns_activity_check" CHECK ("agent_turns"."activity" IS NULL OR length("agent_turns"."activity") <= 200),
	CONSTRAINT "agent_turns_counts_check" CHECK ("agent_turns"."attempt" >= 1 AND "agent_turns"."generation" >= 1 AND "agent_turns"."recoveries" >= 0),
	CONSTRAINT "agent_turns_lease_check" CHECK (("agent_turns"."lease_device_id" IS NULL) = ("agent_turns"."lease_expires_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "agent_work_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"user_agent_id" uuid NOT NULL,
	"agent_actor_entity_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_ref" jsonb NOT NULL,
	"body" text,
	"lane" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"held" boolean DEFAULT false NOT NULL,
	"steered" boolean DEFAULT false NOT NULL,
	"reason" text,
	"turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_work_items_dedupe_unique" UNIQUE("user_agent_id","dedupe_key"),
	CONSTRAINT "agent_work_items_dedupe_check" CHECK (length("agent_work_items"."dedupe_key") BETWEEN 1 AND 300),
	CONSTRAINT "agent_work_items_body_check" CHECK ("agent_work_items"."body" IS NULL OR length("agent_work_items"."body") <= 20000),
	CONSTRAINT "agent_work_items_deadline_check" CHECK ("agent_work_items"."available_at" <= "agent_work_items"."deadline_at")
);
--> statement-breakpoint
CREATE TABLE "agent_helpers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"user_agent_id" uuid NOT NULL,
	"agent_actor_entity_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"parent_session_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"task" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"report" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "agent_helpers_session_unique" UNIQUE("session_id"),
	CONSTRAINT "agent_helpers_request_unique" UNIQUE("parent_session_id","request_id"),
	CONSTRAINT "agent_helpers_task_check" CHECK (length(trim("agent_helpers"."task")) BETWEEN 1 AND 20000),
	CONSTRAINT "agent_helpers_report_check" CHECK ("agent_helpers"."report" IS NULL OR length("agent_helpers"."report") <= 20000)
);
--> statement-breakpoint
CREATE TABLE "agent_routines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"user_agent_id" uuid NOT NULL,
	"agent_actor_entity_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"cron" text NOT NULL,
	"timezone" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"approved_revision" integer,
	"destination_conversation_id" uuid NOT NULL,
	"destination_thread_id" uuid,
	"catch_up" text DEFAULT 'latest' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_fire_at" timestamp with time zone,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_routines_text_check" CHECK (length(trim("agent_routines"."name")) BETWEEN 1 AND 200 AND length(trim("agent_routines"."prompt")) BETWEEN 1 AND 20000 AND length("agent_routines"."cron") BETWEEN 1 AND 100 AND length("agent_routines"."timezone") BETWEEN 1 AND 100),
	CONSTRAINT "agent_routines_revision_check" CHECK ("agent_routines"."revision" >= 1 AND ("agent_routines"."approved_revision" IS NULL OR "agent_routines"."approved_revision" BETWEEN 1 AND "agent_routines"."revision"))
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_owner_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_agent_actor_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id","user_agent_id") REFERENCES "public"."actors"("organization_id","entity_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_parent_fk" FOREIGN KEY ("organization_id","user_agent_id","parent_session_id") REFERENCES "public"."agent_sessions"("organization_id","user_agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_origin_conversation_fk" FOREIGN KEY ("origin_conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_destination_conversation_fk" FOREIGN KEY ("destination_conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_origin_thread_fk" FOREIGN KEY ("origin_conversation_id","origin_thread_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_destination_thread_fk" FOREIGN KEY ("destination_conversation_id","destination_thread_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_owner_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_agent_actor_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id","user_agent_id") REFERENCES "public"."actors"("organization_id","entity_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_session_fk" FOREIGN KEY ("organization_id","user_agent_id","session_id") REFERENCES "public"."agent_sessions"("organization_id","user_agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_lease_device_fk" FOREIGN KEY ("owner_user_id","lease_device_id") REFERENCES "public"."desktop_devices"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_work_items" ADD CONSTRAINT "agent_work_items_turn_id_agent_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."agent_turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_work_items" ADD CONSTRAINT "agent_work_items_owner_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_work_items" ADD CONSTRAINT "agent_work_items_agent_actor_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id","user_agent_id") REFERENCES "public"."actors"("organization_id","entity_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_work_items" ADD CONSTRAINT "agent_work_items_session_fk" FOREIGN KEY ("organization_id","user_agent_id","session_id") REFERENCES "public"."agent_sessions"("organization_id","user_agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_helpers" ADD CONSTRAINT "agent_helpers_owner_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_helpers" ADD CONSTRAINT "agent_helpers_agent_actor_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id","user_agent_id") REFERENCES "public"."actors"("organization_id","entity_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_helpers" ADD CONSTRAINT "agent_helpers_parent_session_fk" FOREIGN KEY ("organization_id","user_agent_id","parent_session_id") REFERENCES "public"."agent_sessions"("organization_id","user_agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_helpers" ADD CONSTRAINT "agent_helpers_session_fk" FOREIGN KEY ("organization_id","user_agent_id","session_id") REFERENCES "public"."agent_sessions"("organization_id","user_agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_routines" ADD CONSTRAINT "agent_routines_owner_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_routines" ADD CONSTRAINT "agent_routines_agent_actor_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id","user_agent_id") REFERENCES "public"."actors"("organization_id","entity_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_routines" ADD CONSTRAINT "agent_routines_destination_conversation_fk" FOREIGN KEY ("destination_conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_routines" ADD CONSTRAINT "agent_routines_destination_thread_fk" FOREIGN KEY ("destination_conversation_id","destination_thread_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_sessions_origin_idx" ON "agent_sessions" USING btree ("origin_conversation_id");--> statement-breakpoint
CREATE INDEX "agent_sessions_destination_idx" ON "agent_sessions" USING btree ("destination_conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_live_folder_unique" ON "agent_turns" USING btree ("folder_key") WHERE "agent_turns"."status" IN ('assigned', 'running', 'waiting', 'stopping');--> statement-breakpoint
CREATE INDEX "agent_turns_live_lease_idx" ON "agent_turns" USING btree ("lease_device_id") WHERE "agent_turns"."status" IN ('assigned', 'running', 'waiting', 'stopping');--> statement-breakpoint
CREATE INDEX "agent_turns_session_idx" ON "agent_turns" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_turns_agent_idx" ON "agent_turns" USING btree ("user_agent_id","created_at","id");--> statement-breakpoint
CREATE INDEX "agent_turns_attention_idx" ON "agent_turns" USING btree ("user_agent_id") WHERE "agent_turns"."status" = 'needs_attention';--> statement-breakpoint
CREATE INDEX "agent_work_items_claimable_idx" ON "agent_work_items" USING btree ("user_agent_id","available_at") WHERE "agent_work_items"."status" IN ('pending', 'confirmed_unconsumed');--> statement-breakpoint
CREATE INDEX "agent_work_items_session_idx" ON "agent_work_items" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "agent_work_items_turn_idx" ON "agent_work_items" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "agent_helpers_running_idx" ON "agent_helpers" USING btree ("user_agent_id") WHERE "agent_helpers"."status" = 'running';--> statement-breakpoint
CREATE INDEX "agent_routines_due_idx" ON "agent_routines" USING btree ("next_fire_at") WHERE "agent_routines"."enabled" AND "agent_routines"."next_fire_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_routines_agent_idx" ON "agent_routines" USING btree ("user_agent_id","created_at");--> statement-breakpoint
DROP TABLE "agent_wakes" CASCADE;--> statement-breakpoint
DROP TABLE "agent_status" CASCADE;
