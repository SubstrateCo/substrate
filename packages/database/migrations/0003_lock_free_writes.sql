ALTER TABLE "idempotent_requests" ALTER COLUMN "entity_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "access_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_settings" ADD COLUMN "pipeline_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_links_directed_pair_unique" ON "entity_links" USING btree ("organization_id","relation_type",least("source_entity_id", "target_entity_id"),greatest("source_entity_id", "target_entity_id")) WHERE "entity_links"."relation_type" IN ('blocks', 'duplicates');--> statement-breakpoint
CREATE UNIQUE INDEX "crm_affiliations_primary_unique" ON "crm_affiliations" USING btree ("organization_id","contact_entity_id") WHERE "crm_affiliations"."is_primary";