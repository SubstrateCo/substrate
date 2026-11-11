-- Readers already ignored these rows: agents use their owner's access, and children use their
-- container's grants.
DELETE FROM "entity_grants" g USING "actors" a
WHERE a."organization_id" = g."organization_id" AND a."entity_id" = g."actor_entity_id"
  AND a."type" <> 'human';--> statement-breakpoint
DELETE FROM "entity_grants" g USING "entities" e
WHERE e."organization_id" = g."organization_id" AND e."entity_id" = g."entity_id"
  AND e."access_entity_id" <> e."entity_id";--> statement-breakpoint
ALTER TABLE "entity_grants" DROP CONSTRAINT "entity_grants_organization_id_entity_id_entities_organization_id_entity_id_fk";
--> statement-breakpoint
ALTER TABLE "entity_grants" DROP CONSTRAINT "entity_grants_organization_id_actor_entity_id_actors_organization_id_entity_id_fk";
--> statement-breakpoint
ALTER TABLE "entity_grants" ADD COLUMN "access_entity_id" uuid GENERATED ALWAYS AS (entity_id) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "entity_grants" ADD COLUMN "actor_type" "actor_type" GENERATED ALWAYS AS ('human'::actor_type) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "entity_grants" ADD CONSTRAINT "entity_grants_container_fk" FOREIGN KEY ("organization_id","entity_id","access_entity_id") REFERENCES "public"."entities"("organization_id","entity_id","access_entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_grants" ADD CONSTRAINT "entity_grants_human_actor_fk" FOREIGN KEY ("organization_id","actor_entity_id","actor_type") REFERENCES "public"."actors"("organization_id","entity_id","type") ON DELETE cascade ON UPDATE no action;