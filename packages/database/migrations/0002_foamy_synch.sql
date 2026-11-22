CREATE TABLE "organization_apps" (
	"organization_id" text NOT NULL,
	"app_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "organization_apps_organization_id_app_id_pk" PRIMARY KEY("organization_id","app_id"),
	CONSTRAINT "organization_apps_app_id_check" CHECK ("organization_apps"."app_id" IN ('tasks', 'crm'))
);
--> statement-breakpoint
ALTER TABLE "organization_apps" ADD CONSTRAINT "organization_apps_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;