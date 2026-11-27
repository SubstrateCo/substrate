ALTER TABLE "user_agents" ADD COLUMN "disabled_apps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_agents" ADD COLUMN "substrate_guide" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_agents" DROP COLUMN "use_startup_defaults";
