CREATE TABLE "user_apps" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"app_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_apps_organization_id_user_id_app_id_pk" PRIMARY KEY("organization_id","user_id","app_id")
);
--> statement-breakpoint
ALTER TABLE "user_apps" ADD CONSTRAINT "user_apps_organization_id_user_id_member_organization_id_user_id_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."member"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DELETE FROM "organization_apps" WHERE "app_id" = 'inbox';
