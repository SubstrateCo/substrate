CREATE TABLE "crm_follow_up_sources" (
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"task_entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_follow_up_sources_organization_id_actor_entity_id_request_id_pk" PRIMARY KEY("organization_id","actor_entity_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "crm_follow_up_sources" ADD CONSTRAINT "crm_followup_actor_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_follow_up_sources" ADD CONSTRAINT "crm_followup_source_fk" FOREIGN KEY ("organization_id","source_entity_id") REFERENCES "public"."entities"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_follow_up_sources" ADD CONSTRAINT "crm_followup_task_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;