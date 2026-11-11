ALTER TABLE "entities" ADD COLUMN "access_entity_id" uuid;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "entity_access_parents" p
		JOIN "entity_access_parents" pp
			ON pp."organization_id" = p."organization_id" AND pp."entity_id" = p."parent_entity_id"
	) THEN
		RAISE EXCEPTION 'entity_access_parents has chains deeper than one level; flatten them before this migration';
	END IF;
END $$;--> statement-breakpoint
UPDATE "entities" e
SET "access_entity_id" = COALESCE(
	(
		SELECT p."parent_entity_id"
		FROM "entity_access_parents" p
		WHERE p."organization_id" = e."organization_id" AND p."entity_id" = e."entity_id"
	),
	e."entity_id"
);--> statement-breakpoint
ALTER TABLE "entities" ALTER COLUMN "access_entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_organization_entity_access_unique" UNIQUE("organization_id","entity_id","access_entity_id");--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_organization_id_access_entity_id_entities_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","access_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_organization_access_idx" ON "entities" USING btree ("organization_id","access_entity_id");--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_organization_id_entity_id_project_entity_id_entity_access_parents_organization_id_entity_id_parent_entity_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_project_entity_id_entities_organization_id_entity_id_access_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","project_entity_id") REFERENCES "public"."entities"("organization_id","entity_id","access_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TABLE "entity_access_parents";--> statement-breakpoint
-- Grants are read only from containers, so grants on child entities are inert.
DELETE FROM "entity_grants" g
USING "entities" e
WHERE e."organization_id" = g."organization_id"
	AND e."entity_id" = g."entity_id"
	AND e."access_entity_id" <> e."entity_id";
