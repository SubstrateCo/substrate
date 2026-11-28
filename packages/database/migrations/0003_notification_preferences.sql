CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"paused_until" timestamp with time zone,
	"schedule_days" smallint,
	"schedule_start" smallint,
	"schedule_end" smallint,
	"schedule_time_zone" text,
	"preview" text DEFAULT 'hidden' NOT NULL,
	"sound" boolean DEFAULT true NOT NULL,
	"flash" text DEFAULT 'idle' NOT NULL,
	CONSTRAINT "notification_schedule_check" CHECK (("notification_preferences"."schedule_days" IS NULL AND "notification_preferences"."schedule_start" IS NULL AND "notification_preferences"."schedule_end" IS NULL AND "notification_preferences"."schedule_time_zone" IS NULL)
        OR ("notification_preferences"."schedule_days" BETWEEN 1 AND 127
          AND "notification_preferences"."schedule_start" BETWEEN 0 AND 1439
          AND "notification_preferences"."schedule_end" BETWEEN 0 AND 1439
          AND "notification_preferences"."schedule_start" <> "notification_preferences"."schedule_end"
          AND length("notification_preferences"."schedule_time_zone") BETWEEN 1 AND 100))
);
--> statement-breakpoint
CREATE TABLE "notification_workspace_preferences" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channels" text DEFAULT 'mentions' NOT NULL,
	"muted_until" timestamp with time zone,
	"assignments" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_workspace_preferences_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD COLUMN "notification_level" text;--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD COLUMN "notifications_muted_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_workspace_preferences" ADD CONSTRAINT "notification_workspace_preferences_organization_id_user_id_member_organization_id_user_id_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."member"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;