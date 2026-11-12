CREATE TABLE "crm_activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_activity_entity_type" CHECK ("crm_activity_events"."entity_type"::text in ('account', 'contact', 'deal')),
	CONSTRAINT "crm_activity_action" CHECK ("crm_activity_events"."action" in ('created', 'updated', 'stage_changed', 'owner_changed', 'discussion_linked', 'discussion_unlinked', 'context_linked', 'context_unlinked', 'interaction_created', 'interaction_updated', 'interaction_deleted', 'follow_up_created', 'shared', 'unshared', 'archived', 'restored')),
	CONSTRAINT "crm_activity_fields" CHECK (jsonb_typeof("crm_activity_events"."changed_fields") = 'array' and "crm_activity_events"."changed_fields" <@ '["name","website","domain","summary","displayName","givenName","familyName","notes","middleName","namePrefix","nameSuffix","nickname","title","account","contacts","primaryContact","stage","amount","currency","expectedCloseDate","outcome","lostReason","owner","identifier","address","url","affiliation","role","kind","occurredAt","endedAt","sharing"]'::jsonb)
);
--> statement-breakpoint
ALTER TABLE "crm_activity_events" ADD CONSTRAINT "crm_activity_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity_events" ADD CONSTRAINT "crm_activity_entity_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity_events" ADD CONSTRAINT "crm_activity_actor_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity_events" ADD CONSTRAINT "crm_activity_related_fk" FOREIGN KEY ("organization_id","related_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_activity_page_idx" ON "crm_activity_events" USING btree ("organization_id","entity_id","created_at","id");
