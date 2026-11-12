ALTER TYPE "public"."entity_type" ADD VALUE 'account';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'deal';--> statement-breakpoint
CREATE TABLE "crm_accounts" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"domain" text,
	"summary" text DEFAULT '' NOT NULL,
	"owner_actor_entity_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "crm_accounts_organization_id_entity_id_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "crm_account_type" CHECK ("crm_accounts"."entity_type"::text = 'account'),
	CONSTRAINT "crm_account_name" CHECK (length(trim("crm_accounts"."name")) between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "crm_affiliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"account_entity_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "crm_affiliations_organization_id_contact_entity_id_account_entity_id_unique" UNIQUE("organization_id","contact_entity_id","account_entity_id")
);
--> statement-breakpoint
CREATE TABLE "crm_contact_profiles" (
	"organization_id" text NOT NULL,
	"contact_entity_id" uuid PRIMARY KEY NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_deal_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"deal_entity_id" uuid NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "crm_deal_contacts_organization_id_deal_entity_id_contact_entity_id_unique" UNIQUE("organization_id","deal_entity_id","contact_entity_id")
);
--> statement-breakpoint
CREATE TABLE "crm_deal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"deal_entity_id" uuid NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"request_id" uuid,
	"fingerprint" text,
	"from_stage_id" uuid,
	"to_stage_id" uuid NOT NULL,
	"from_outcome" text,
	"to_outcome" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_deal_events_organization_id_deal_entity_id_request_id_unique" UNIQUE("organization_id","deal_entity_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"title" text NOT NULL,
	"account_entity_id" uuid,
	"owner_actor_entity_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"outcome" text DEFAULT 'open' NOT NULL,
	"amount" numeric(19, 4),
	"currency" text,
	"expected_close_date" date,
	"closed_at" timestamp with time zone,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"lost_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "crm_deals_organization_id_entity_id_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "crm_deal_type" CHECK ("crm_deals"."entity_type"::text = 'deal'),
	CONSTRAINT "crm_deal_money" CHECK (("crm_deals"."amount" is null and "crm_deals"."currency" is null) or ("crm_deals"."amount" is not null and "crm_deals"."currency" is not null and "crm_deals"."amount" >= 0 and "crm_deals"."currency" ~ '^[A-Z]{3}$')),
	CONSTRAINT "crm_deal_outcome" CHECK ("crm_deals"."outcome" in ('open','won','lost') and (("crm_deals"."outcome" = 'open') = ("crm_deals"."closed_at" is null)))
);
--> statement-breakpoint
CREATE TABLE "crm_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"retired" boolean DEFAULT false NOT NULL,
	CONSTRAINT "crm_stages_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "message_entity_references" DROP CONSTRAINT "message_reference_type_check";--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_organization_id_owner_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","owner_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_affiliations" ADD CONSTRAINT "crm_affiliations_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_affiliations" ADD CONSTRAINT "crm_affiliations_organization_id_account_entity_id_crm_accounts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","account_entity_id") REFERENCES "public"."crm_accounts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_profiles" ADD CONSTRAINT "crm_contact_profiles_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_contacts" ADD CONSTRAINT "crm_deal_contacts_organization_id_deal_entity_id_crm_deals_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","deal_entity_id") REFERENCES "public"."crm_deals"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_contacts" ADD CONSTRAINT "crm_deal_contacts_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_events" ADD CONSTRAINT "crm_deal_events_organization_id_deal_entity_id_crm_deals_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","deal_entity_id") REFERENCES "public"."crm_deals"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_events" ADD CONSTRAINT "crm_deal_events_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_events" ADD CONSTRAINT "crm_deal_events_organization_id_from_stage_id_crm_stages_organization_id_id_fk" FOREIGN KEY ("organization_id","from_stage_id") REFERENCES "public"."crm_stages"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_events" ADD CONSTRAINT "crm_deal_events_organization_id_to_stage_id_crm_stages_organization_id_id_fk" FOREIGN KEY ("organization_id","to_stage_id") REFERENCES "public"."crm_stages"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_account_entity_id_crm_accounts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","account_entity_id") REFERENCES "public"."crm_accounts"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_owner_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","owner_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_stage_id_crm_stages_organization_id_id_fk" FOREIGN KEY ("organization_id","stage_id") REFERENCES "public"."crm_stages"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_affiliations_account_idx" ON "crm_affiliations" USING btree ("organization_id","account_entity_id");--> statement-breakpoint
CREATE INDEX "crm_deals_stage_idx" ON "crm_deals" USING btree ("organization_id","stage_id");--> statement-breakpoint
ALTER TABLE "message_entity_references" ADD CONSTRAINT "message_reference_type_check" CHECK ("message_entity_references"."entity_type"::text IN ('task', 'project', 'contact', 'account', 'deal', 'contact_interaction'));