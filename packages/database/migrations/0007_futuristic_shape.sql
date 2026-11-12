CREATE TABLE "crm_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"default_currency" text,
	CONSTRAINT "crm_settings_currency" CHECK ("crm_settings"."default_currency" is null or "crm_settings"."default_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "crm_settings" ADD CONSTRAINT "crm_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;