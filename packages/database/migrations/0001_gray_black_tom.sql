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
ALTER TABLE "messaging_messages" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversation_organization_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_organization_id_conversation_id_messaging_conversations_organization_id_id_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."messaging_conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_organization_id_created_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","created_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_task_requests" ADD CONSTRAINT "source_task_requests_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_task_requests" ADD CONSTRAINT "source_task_requests_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_message_id_messaging_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messaging_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_recipient_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","recipient_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_reference_target_idx" ON "message_entity_references" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE INDEX "task_activity_timeline_idx" ON "task_activity" USING btree ("organization_id","task_entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "notification_recipient_idx" ON "notifications" USING btree ("organization_id","recipient_actor_entity_id","created_at","id");--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_message_request_unique" UNIQUE("author_id","request_id");
