CREATE TYPE "public"."contact_interaction_kind" AS ENUM('email', 'meeting', 'call', 'message', 'note', 'other');--> statement-breakpoint
CREATE TYPE "public"."contact_interaction_origin" AS ENUM('manual', 'imported');--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'contact_interaction' BEFORE 'company';--> statement-breakpoint
CREATE TABLE "contact_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"street_address" text,
	"extended_address" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country_code" text,
	"formatted_address" text,
	CONSTRAINT "contact_addresses_nonempty_check" CHECK (length(trim(concat_ws('', "contact_addresses"."street_address", "contact_addresses"."extended_address", "contact_addresses"."city", "contact_addresses"."region", "contact_addresses"."postal_code", "contact_addresses"."country_code", "contact_addresses"."formatted_address"))) > 0),
	CONSTRAINT "contact_addresses_country_check" CHECK ("contact_addresses"."country_code" IS NULL OR "contact_addresses"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "contact_urls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "contact_urls_scheme_check" CHECK ("contact_urls"."url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "contact_interactions" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"kind" "contact_interaction_kind" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"summary" text NOT NULL,
	"origin" "contact_interaction_origin" NOT NULL,
	"source_entity_id" uuid,
	"source_entity_type" "entity_type",
	"created_by_actor_entity_id" uuid NOT NULL,
	CONSTRAINT "contact_interactions_type_check" CHECK ("contact_interactions"."entity_type"::text = 'contact_interaction'),
	CONSTRAINT "contact_interactions_summary_check" CHECK (length(trim("contact_interactions"."summary")) > 0),
	CONSTRAINT "contact_interactions_time_check" CHECK ("contact_interactions"."ended_at" IS NULL OR "contact_interactions"."ended_at" >= "contact_interactions"."occurred_at"),
	CONSTRAINT "contact_interactions_source_check" CHECK (("contact_interactions"."origin" = 'manual' AND "contact_interactions"."source_entity_id" IS NULL AND "contact_interactions"."source_entity_type" IS NULL) OR ("contact_interactions"."origin" = 'imported' AND "contact_interactions"."source_entity_id" IS NOT NULL AND "contact_interactions"."source_entity_type" IS NOT NULL)),
	CONSTRAINT "contact_interactions_no_self_source_check" CHECK ("contact_interactions"."source_entity_id" IS NULL OR "contact_interactions"."source_entity_id" <> "contact_interactions"."entity_id")
);
--> statement-breakpoint
ALTER TABLE "contact_identifiers" DROP CONSTRAINT "contact_identifiers_organization_id_contact_entity_id_type_value_pk";--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD COLUMN "normalized_value" text;--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD COLUMN "extension" text;--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "given_name" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "middle_name" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "family_name" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "name_prefix" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "name_suffix" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "contact_addresses" ADD CONSTRAINT "contact_addresses_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_urls" ADD CONSTRAINT "contact_urls_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_contact_entity_id_contacts_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","contact_entity_id") REFERENCES "public"."contacts"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_entity_id_contact_entity_id_entities_organization_id_entity_id_access_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","contact_entity_id") REFERENCES "public"."entities"("organization_id","entity_id","access_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_source_entity_id_source_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","source_entity_id","source_entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_organization_id_created_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","created_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_addresses_contact_idx" ON "contact_addresses" USING btree ("organization_id","contact_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_addresses_primary_unique" ON "contact_addresses" USING btree ("organization_id","contact_entity_id") WHERE "contact_addresses"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "contact_urls_value_unique" ON "contact_urls" USING btree ("organization_id","contact_entity_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_urls_primary_unique" ON "contact_urls" USING btree ("organization_id","contact_entity_id") WHERE "contact_urls"."is_primary";--> statement-breakpoint
CREATE INDEX "contact_interactions_timeline_idx" ON "contact_interactions" USING btree ("organization_id","contact_entity_id","occurred_at" DESC NULLS LAST,"entity_id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "contact_interactions_source_unique" ON "contact_interactions" USING btree ("organization_id","contact_entity_id","source_entity_id") WHERE "contact_interactions"."origin" = 'imported';--> statement-breakpoint
CREATE INDEX "contact_interactions_source_idx" ON "contact_interactions" USING btree ("organization_id","source_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identifiers_value_unique" ON "contact_identifiers" USING btree ("organization_id","contact_entity_id","type",coalesce("normalized_value", "value"),coalesce("extension", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identifiers_primary_unique" ON "contact_identifiers" USING btree ("organization_id","contact_entity_id","type") WHERE "contact_identifiers"."is_primary";--> statement-breakpoint
CREATE INDEX "contact_identifiers_lookup_idx" ON "contact_identifiers" USING btree ("organization_id","type","normalized_value");--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD CONSTRAINT "contact_identifiers_extension_check" CHECK ("contact_identifiers"."extension" IS NULL OR ("contact_identifiers"."type" = 'phone' AND "contact_identifiers"."extension" ~ '^[0-9]+$'));