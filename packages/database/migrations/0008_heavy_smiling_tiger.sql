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
ALTER TABLE "messaging_participants" ADD COLUMN "consented_at" timestamp with time zone;--> statement-breakpoint
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
CREATE INDEX "messaging_invitation_email_idx" ON "messaging_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "messaging_invitation_conversation_idx" ON "messaging_invitations" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messaging_invitation_delivery_idx" ON "messaging_invitations" USING btree ("next_delivery_at") WHERE "messaging_invitations"."status" = 'pending' AND "messaging_invitations"."delivered_at" IS NULL;--> statement-breakpoint
CREATE INDEX "messaging_sharing_event_conversation_idx" ON "messaging_sharing_events" USING btree ("conversation_id","created_at");