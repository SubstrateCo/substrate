CREATE TABLE "user_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"instructions" text NOT NULL,
	"harness" text NOT NULL,
	"model" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"use_startup_defaults" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_agents_owner_id_unique" UNIQUE("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;