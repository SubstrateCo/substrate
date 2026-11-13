CREATE TABLE "idempotent_requests" (
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotent_requests_organization_id_actor_entity_id_operation_request_id_pk" PRIMARY KEY("organization_id","actor_entity_id","operation","request_id"),
	CONSTRAINT "idempotent_request_operation" CHECK (operation in ('account', 'deal', 'deal_transition', 'crm_from_message', 'crm_follow_up', 'task_from_message'))
);
--> statement-breakpoint
ALTER TABLE "idempotent_requests" ADD CONSTRAINT "idempotent_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotent_requests" ADD CONSTRAINT "idempotent_request_actor_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotent_requests" ADD CONSTRAINT "idempotent_request_entity_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;