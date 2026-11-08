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
ALTER TABLE "message_messaging_references" ADD CONSTRAINT "message_messaging_references_organization_id_conversation_id_messaging_conversations_organization_id_id_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."messaging_conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_messaging_references" ADD CONSTRAINT "message_messaging_references_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_messaging_references" ADD CONSTRAINT "message_messaging_references_organization_id_target_conversation_id_messaging_conversations_organization_id_id_fk" FOREIGN KEY ("organization_id","target_conversation_id") REFERENCES "public"."messaging_conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_messaging_references" ADD CONSTRAINT "message_messaging_references_target_conversation_id_target_thread_id_thread_root_messaging_messages_conversation_id_id_is_root_fk" FOREIGN KEY ("target_conversation_id","target_thread_id","thread_root") REFERENCES "public"."messaging_messages"("conversation_id","id","is_root") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messaging_reference_target_idx" ON "message_messaging_references" USING btree ("organization_id","target_conversation_id","target_thread_id");