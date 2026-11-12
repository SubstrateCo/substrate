-- Remove dependent foreign keys and generated columns before replacing the enum.
ALTER TABLE "actors" DROP CONSTRAINT "actors_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "contact_interactions" DROP CONSTRAINT "contact_interactions_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "contact_interactions" DROP CONSTRAINT "contact_interactions_organization_id_source_entity_id_source_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "message_entity_references" DROP CONSTRAINT "message_entity_references_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk";--> statement-breakpoint
ALTER TABLE "message_entity_references" DROP CONSTRAINT "message_reference_type_check";--> statement-breakpoint
ALTER TABLE "contact_interactions" DROP CONSTRAINT "contact_interactions_type_check";--> statement-breakpoint
ALTER TABLE "actors" DROP COLUMN "entity_type";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "entity_type";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "entity_type";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "entity_type";--> statement-breakpoint
ALTER TABLE "entities" ALTER COLUMN "entity_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "contact_interactions" ALTER COLUMN "entity_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "contact_interactions" ALTER COLUMN "source_entity_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "message_entity_references" ALTER COLUMN "entity_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."entity_type";--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('actor', 'contact', 'contact_interaction', 'project', 'task');--> statement-breakpoint
ALTER TABLE "entities" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type" USING "entity_type"::"public"."entity_type";--> statement-breakpoint
ALTER TABLE "actors" ADD COLUMN "entity_type" "public"."entity_type" GENERATED ALWAYS AS ('actor'::entity_type) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "entity_type" "public"."entity_type" GENERATED ALWAYS AS ('contact'::entity_type) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_interactions" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type" USING "entity_type"::"public"."entity_type";--> statement-breakpoint
ALTER TABLE "contact_interactions" ALTER COLUMN "source_entity_type" SET DATA TYPE "public"."entity_type" USING "source_entity_type"::"public"."entity_type";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "entity_type" "public"."entity_type" GENERATED ALWAYS AS ('project'::entity_type) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "entity_type" "public"."entity_type" GENERATED ALWAYS AS ('task'::entity_type) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "message_entity_references" ALTER COLUMN "entity_type" SET DATA TYPE "public"."entity_type" USING "entity_type"::"public"."entity_type";--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id", "entity_id", "entity_type") REFERENCES "entities" ("organization_id", "entity_id", "entity_type") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id", "entity_id", "entity_type") REFERENCES "entities" ("organization_id", "entity_id", "entity_type") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id", "entity_id", "entity_type") REFERENCES "entities" ("organization_id", "entity_id", "entity_type") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_source_entity_id_source_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id", "source_entity_id", "source_entity_type") REFERENCES "entities" ("organization_id", "entity_id", "entity_type");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id", "entity_id", "entity_type") REFERENCES "entities" ("organization_id", "entity_id", "entity_type") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id", "entity_id", "entity_type") REFERENCES "entities" ("organization_id", "entity_id", "entity_type") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_entity_references_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id", "entity_id", "entity_type") REFERENCES "entities" ("organization_id", "entity_id", "entity_type") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_reference_type_check" CHECK ("entity_type" IN ('task', 'project'));
--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_type_check" CHECK ("entity_type"::text = 'contact_interaction');
