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
	"session_key" text NOT NULL,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"wake_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_invocations_message_unique" UNIQUE("user_agent_id","message_id"),
	CONSTRAINT "agent_invocation_status_check" CHECK ("agent_invocations"."status" IN ('received', 'pending_approval', 'admitted', 'rate_limited', 'declined', 'expired', 'cancelled', 'dropped')),
	CONSTRAINT "agent_invocation_kind_check" CHECK ("agent_invocations"."kind" IN ('mention', 'thread_reply')),
	CONSTRAINT "agent_invocation_policy_check" CHECK ("agent_invocations"."policy" IN ('owner', 'anyone', 'ask')),
	CONSTRAINT "agent_invocation_caller_check" CHECK ("agent_invocations"."caller_user_id" <> "agent_invocations"."owner_user_id"),
	CONSTRAINT "agent_invocation_session_key_check" CHECK (length("agent_invocations"."session_key") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "user_agent_callers" ADD CONSTRAINT "user_agent_callers_owner_user_id_user_agent_id_user_agents_user_id_id_fk" FOREIGN KEY ("owner_user_id","user_agent_id") REFERENCES "public"."user_agents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_callers" ADD CONSTRAINT "user_agent_callers_agent_fk" FOREIGN KEY ("organization_id","user_agent_id") REFERENCES "public"."actors"("organization_id","user_agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_callers" ADD CONSTRAINT "user_agent_callers_caller_fk" FOREIGN KEY ("organization_id","caller_actor_entity_id","caller_user_id") REFERENCES "public"."actors"("organization_id","entity_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_callers" ADD CONSTRAINT "user_agent_callers_member_fk" FOREIGN KEY ("organization_id","caller_user_id") REFERENCES "public"."member"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "agent_audit_events_agent_idx" ON "agent_audit_events" USING btree ("user_agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_invocations_owner_status_idx" ON "agent_invocations" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "agent_invocations_caller_idx" ON "agent_invocations" USING btree ("user_agent_id","caller_user_id","status");--> statement-breakpoint
CREATE INDEX "agent_invocations_conversation_idx" ON "agent_invocations" USING btree ("conversation_id","caller_user_id");