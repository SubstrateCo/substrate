DELETE FROM "idempotent_requests" WHERE "operation" = 'meeting' OR "entity_id" IN (SELECT "entity_id" FROM "entities" WHERE "entity_type" IN ('meeting', 'meeting_archive'));--> statement-breakpoint
DELETE FROM "agent_tool_requests" WHERE "tool" IN ('list_meetings', 'get_meeting', 'read_meeting_source', 'create_meeting');--> statement-breakpoint
DELETE FROM "entities" WHERE "entity_type" IN ('meeting', 'meeting_archive');--> statement-breakpoint
DELETE FROM "organization_apps" WHERE "app_id" = 'meetings';--> statement-breakpoint
DROP TABLE "meeting_originals";--> statement-breakpoint
DROP TABLE "meeting_connections";--> statement-breakpoint
DROP TABLE "meetings";--> statement-breakpoint
DROP TABLE "meeting_archives";--> statement-breakpoint
ALTER TABLE "message_entity_references" DROP CONSTRAINT "message_reference_meeting_source";--> statement-breakpoint
ALTER TABLE "actors" DROP CONSTRAINT "actors_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "contact_interactions" DROP CONSTRAINT "contact_interactions_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "message_entity_references" DROP CONSTRAINT "message_entity_references_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "crm_accounts" DROP CONSTRAINT "crm_accounts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "crm_deals" DROP CONSTRAINT "crm_deals_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "crm_activity_events" DROP CONSTRAINT "crm_activity_entity_fk";--> statement-breakpoint
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "calendars" DROP CONSTRAINT "calendars_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TYPE "public"."entity_type" RENAME TO "entity_type_old";--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('actor', 'contact', 'contact_interaction', 'project', 'task', 'account', 'deal', 'calendar', 'calendar_event');--> statement-breakpoint
CREATE CAST ("public"."entity_type_old" AS "public"."entity_type") WITH INOUT AS ASSIGNMENT;--> statement-breakpoint
ALTER TABLE "entities" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
ALTER TABLE "actors" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
ALTER TABLE "actors" ALTER COLUMN "entity_type" SET EXPRESSION AS ('actor'::"public"."entity_type");--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "entity_type" SET EXPRESSION AS ('contact'::"public"."entity_type");--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "entity_type" SET EXPRESSION AS ('project'::"public"."entity_type");--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "entity_type" SET EXPRESSION AS ('task'::"public"."entity_type");--> statement-breakpoint
ALTER TABLE "contact_interactions" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
ALTER TABLE "message_entity_references" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
ALTER TABLE "crm_accounts" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
ALTER TABLE "crm_deals" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
ALTER TABLE "crm_activity_events" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
ALTER TABLE "calendar_events" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type";--> statement-breakpoint
DROP CAST ("public"."entity_type_old" AS "public"."entity_type");--> statement-breakpoint
DROP TYPE "public"."entity_type_old";--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity_events" ADD CONSTRAINT "crm_activity_entity_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" DROP CONSTRAINT "contact_interactions_organization_id_entity_id_contact_entity_id_entities_organization_id_entity_id_access_entity_id_fk";--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_entity_id_contact_entity_id_entities_organization_id_entity_id_access_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","contact_entity_id") REFERENCES "public"."entities"("organization_id","entity_id","access_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_organization_id_entity_id_project_entity_id_entities_organization_id_entity_id_access_entity_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_project_entity_id_entities_organization_id_entity_id_access_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","project_entity_id") REFERENCES "public"."entities"("organization_id","entity_id","access_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_organization_id_entity_id_calendar_entity_id_entities_organization_id_entity_id_access_entity_id_fk";--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_entity_id_calendar_entity_id_entities_organization_id_entity_id_access_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","calendar_entity_id") REFERENCES "public"."entities"("organization_id","entity_id","access_entity_id") ON DELETE no action ON UPDATE no action;
