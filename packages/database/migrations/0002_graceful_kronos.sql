CREATE TABLE "messaging_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"private" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
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
	"thread_id" uuid,
	"is_root" boolean GENERATED ALWAYS AS (thread_id IS NULL) STORED,
	"thread_root" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_message_conversation_unique" UNIQUE("conversation_id","id"),
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
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_author_id_messaging_participants_conversation_id_user_id_fk" FOREIGN KEY ("conversation_id","author_id") REFERENCES "public"."messaging_participants"("conversation_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_thread_root_fk" FOREIGN KEY ("conversation_id","thread_id","thread_root") REFERENCES "public"."messaging_messages"("conversation_id","id","is_root") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_organization_id_user_id_member_organization_id_user_id_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."member"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_reactions" ADD CONSTRAINT "messaging_reactions_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_reactions" ADD CONSTRAINT "messaging_reactions_conversation_id_user_id_messaging_participants_conversation_id_user_id_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."messaging_participants"("conversation_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messaging_message_timeline_idx" ON "messaging_messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messaging_participants_user_idx" ON "messaging_participants" USING btree ("user_id");