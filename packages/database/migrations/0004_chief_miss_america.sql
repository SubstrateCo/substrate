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
	CONSTRAINT "agent_wake_source_check" CHECK ("agent_wakes"."source" IN ('owner_message', 'answer', 'approval_result')),
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
	CONSTRAINT "agent_request_status_check" CHECK ("agent_requests"."status" IN ('pending', 'resolved', 'delivered', 'executing', 'executed', 'failed', 'cancelled', 'expired', 'orphaned')),
	CONSTRAINT "agent_request_blocking_check" CHECK ("agent_requests"."mode" <> 'blocking' OR "agent_requests"."native_request_id" IS NOT NULL),
	CONSTRAINT "agent_request_proposal_check" CHECK (("agent_requests"."kind" = 'proposal') = ("agent_requests"."proposed_action" IS NOT NULL AND "agent_requests"."action_hash" IS NOT NULL) AND ("agent_requests"."kind" <> 'proposal' OR "agent_requests"."mode" = 'async')),
	CONSTRAINT "agent_request_place_check" CHECK ("agent_requests"."conversation_id" IS NOT NULL OR ("agent_requests"."anchor_message_id" IS NULL AND "agent_requests"."thread_id" IS NULL)),
	CONSTRAINT "agent_request_session_key_check" CHECK (length("agent_requests"."session_key") BETWEEN 1 AND 200)
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
	"version" integer NOT NULL,
	CONSTRAINT "agent_status_state_check" CHECK ("agent_status"."state" IN ('idle', 'working', 'queued', 'needs_you')),
	CONSTRAINT "agent_status_activity_check" CHECK ("agent_status"."activity" IS NULL OR length("agent_status"."activity") <= 200),
	CONSTRAINT "agent_status_queued_check" CHECK ("agent_status"."queued_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent_wakes" ADD CONSTRAINT "agent_wakes_owner_user_id_user_agent_id_user_agents_user_id_id_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_wakes" ADD CONSTRAINT "agent_wakes_organization_id_agent_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_owner_user_id_user_agent_id_user_agents_user_id_id_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_organization_id_agent_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","agent_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_conversation_id_anchor_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","anchor_message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_conversation_id_thread_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","thread_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_live_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("live_conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_owner_user_id_user_agent_id_user_agents_user_id_id_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_wakes_pending_idx" ON "agent_wakes" USING btree ("user_agent_id","acked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_requests_native_unique" ON "agent_requests" USING btree ("user_agent_id","turn_id","native_request_id") WHERE "agent_requests"."native_request_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_requests_owner_status_idx" ON "agent_requests" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "agent_requests_conversation_idx" ON "agent_requests" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_requests_thread_idx" ON "agent_requests" USING btree ("user_agent_id","thread_id");--> statement-breakpoint
CREATE INDEX "agent_requests_turn_idx" ON "agent_requests" USING btree ("turn_id");