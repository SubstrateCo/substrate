DROP TABLE "task_links" CASCADE;--> statement-breakpoint
DROP TABLE "message_messaging_references" CASCADE;--> statement-breakpoint
DROP TABLE "source_task_requests" CASCADE;--> statement-breakpoint
DROP TABLE "crm_deal_events" CASCADE;--> statement-breakpoint
DROP TABLE "crm_interaction_publications" CASCADE;--> statement-breakpoint
DROP TABLE "crm_follow_up_sources" CASCADE;--> statement-breakpoint
DROP TABLE "crm_create_requests" CASCADE;--> statement-breakpoint
DROP TABLE "crm_owner_events" CASCADE;--> statement-breakpoint
ALTER TABLE "contact_interactions" DROP CONSTRAINT "contact_interactions_source_check";--> statement-breakpoint
ALTER TABLE "contact_interactions" DROP CONSTRAINT "contact_interactions_no_self_source_check";--> statement-breakpoint
ALTER TABLE "contact_interactions" DROP CONSTRAINT "contact_interactions_organization_id_source_entity_id_source_entity_type_entities_organization_id_entity_id_entity_type_fk";
--> statement-breakpoint
DROP INDEX "contact_interactions_source_unique";--> statement-breakpoint
DROP INDEX "contact_interactions_source_idx";--> statement-breakpoint
UPDATE "contact_interactions" SET "origin" = 'manual' WHERE "origin" = 'imported';--> statement-breakpoint
ALTER TABLE "contact_interactions" ALTER COLUMN "origin" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."contact_interaction_origin";--> statement-breakpoint
CREATE TYPE "public"."contact_interaction_origin" AS ENUM('manual', 'message_publication');--> statement-breakpoint
ALTER TABLE "contact_interactions" ALTER COLUMN "origin" SET DATA TYPE "public"."contact_interaction_origin" USING "origin"::"public"."contact_interaction_origin";--> statement-breakpoint
DELETE FROM "entity_links" WHERE "relation_type" = 'mentions';--> statement-breakpoint
DELETE FROM "entity_links" "later" USING "entity_links" "earlier" WHERE "later"."relation_type" = 'related_to' AND "earlier"."relation_type" = 'related_to' AND "later"."organization_id" = "earlier"."organization_id" AND "later"."source_entity_id" = "earlier"."target_entity_id" AND "later"."target_entity_id" = "earlier"."source_entity_id" AND "later"."source_entity_id" > "later"."target_entity_id";--> statement-breakpoint
UPDATE "entity_links" SET "source_entity_id" = "target_entity_id", "target_entity_id" = "source_entity_id" WHERE "relation_type" = 'related_to' AND "source_entity_id" > "target_entity_id";--> statement-breakpoint
ALTER TABLE "entity_links" ALTER COLUMN "relation_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."relation_type";--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('related_to', 'blocks', 'duplicates');--> statement-breakpoint
ALTER TABLE "entity_links" ALTER COLUMN "relation_type" SET DATA TYPE "public"."relation_type" USING "relation_type"::"public"."relation_type";--> statement-breakpoint
ALTER TABLE "entity_links" DROP CONSTRAINT "entity_links_organization_id_source_entity_id_target_entity_id_relation_type_pk";--> statement-breakpoint
ALTER TABLE "entity_links" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_interactions" DROP COLUMN "source_entity_id";--> statement-breakpoint
ALTER TABLE "contact_interactions" DROP COLUMN "source_entity_type";--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_pair_unique" UNIQUE("organization_id","source_entity_id","target_entity_id","relation_type");--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_related_order" CHECK ("entity_links"."relation_type"::text <> 'related_to' OR "entity_links"."source_entity_id" < "entity_links"."target_entity_id");
