ALTER TYPE "public"."contact_interaction_origin" ADD VALUE 'message_publication';--> statement-breakpoint
CREATE TABLE "crm_interaction_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"interaction_entity_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"publisher_actor_entity_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_publication_contact_message_unique" UNIQUE("organization_id","contact_entity_id","message_id"),
	CONSTRAINT "crm_publication_interaction_unique" UNIQUE("organization_id","interaction_entity_id")
);
--> statement-breakpoint
ALTER TABLE "contact_interactions" DROP CONSTRAINT "contact_interactions_source_check";--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_org_entity_contact_unique" UNIQUE("organization_id","entity_id","contact_entity_id");--> statement-breakpoint
ALTER TABLE "crm_interaction_publications" ADD CONSTRAINT "crm_publication_interaction_fk" FOREIGN KEY ("organization_id","interaction_entity_id","contact_entity_id") REFERENCES "public"."contact_interactions"("organization_id","entity_id","contact_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_interaction_publications" ADD CONSTRAINT "crm_publication_publisher_fk" FOREIGN KEY ("organization_id","publisher_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_source_check" CHECK (("contact_interactions"."origin"::text IN ('manual', 'message_publication') AND "contact_interactions"."source_entity_id" IS NULL AND "contact_interactions"."source_entity_type" IS NULL) OR ("contact_interactions"."origin"::text = 'imported' AND "contact_interactions"."source_entity_id" IS NOT NULL AND "contact_interactions"."source_entity_type" IS NOT NULL));
