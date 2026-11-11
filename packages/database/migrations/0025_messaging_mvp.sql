CREATE TABLE "messaging_read_positions" (
	"conversation_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"message_created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "messaging_read_positions_conversation_id_actor_entity_id_pk" PRIMARY KEY("conversation_id","actor_entity_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notification_kind_check";--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messaging_read_positions" ADD CONSTRAINT "messaging_read_positions_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_read_positions" ADD CONSTRAINT "messaging_read_positions_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_deleted_body_check" CHECK ("messaging_messages"."deleted_at" IS NULL OR "messaging_messages"."body" = '');--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notification_kind_check" CHECK ("notifications"."kind" IN ('assignment', 'mention', 'reply', 'message'));