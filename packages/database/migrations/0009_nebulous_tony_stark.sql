CREATE TABLE "crm_create_requests" (
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"entity_id" uuid NOT NULL,
	CONSTRAINT "crm_create_requests_organization_id_actor_entity_id_operation_request_id_pk" PRIMARY KEY("organization_id","actor_entity_id","operation","request_id"),
	CONSTRAINT "crm_create_request_operation" CHECK ("crm_create_requests"."operation" in ('account', 'deal'))
);
--> statement-breakpoint
CREATE TABLE "crm_owner_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"from_actor_entity_id" uuid NOT NULL,
	"to_actor_entity_id" uuid NOT NULL,
	"access_decision" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_owner_event_type" CHECK ("crm_owner_events"."entity_type"::text in ('account', 'deal')),
	CONSTRAINT "crm_owner_event_access_decision" CHECK ("crm_owner_events"."access_decision" in ('require_existing_access', 'keep_restricted'))
);
--> statement-breakpoint
ALTER TABLE "crm_create_requests" ADD CONSTRAINT "crm_create_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_create_requests" ADD CONSTRAINT "crm_create_request_actor_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_create_requests" ADD CONSTRAINT "crm_create_request_entity_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_owner_events" ADD CONSTRAINT "crm_owner_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_owner_events" ADD CONSTRAINT "crm_owner_event_entity_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_owner_events" ADD CONSTRAINT "crm_owner_event_actor_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_owner_events" ADD CONSTRAINT "crm_owner_event_from_fk" FOREIGN KEY ("organization_id","from_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_owner_events" ADD CONSTRAINT "crm_owner_event_to_fk" FOREIGN KEY ("organization_id","to_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;