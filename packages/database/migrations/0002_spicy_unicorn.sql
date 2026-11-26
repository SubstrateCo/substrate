CREATE TABLE "messaging_thread_read_positions" (
	"conversation_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"message_created_at" timestamp with time zone NOT NULL,
	"viewing_until" timestamp with time zone,
	CONSTRAINT "messaging_thread_read_positions_thread_id_actor_entity_id_pk" PRIMARY KEY("thread_id","actor_entity_id")
);
--> statement-breakpoint
ALTER TABLE "messaging_read_positions" ADD COLUMN "viewing_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messaging_thread_read_positions" ADD CONSTRAINT "messaging_thread_read_positions_thread_fk" FOREIGN KEY ("conversation_id","thread_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_read_positions" ADD CONSTRAINT "messaging_thread_read_positions_actor_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;