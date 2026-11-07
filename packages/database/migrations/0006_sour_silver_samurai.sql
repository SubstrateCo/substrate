ALTER TABLE "user_agents" ADD COLUMN "image_file_id" uuid;--> statement-breakpoint
ALTER TABLE "user_agents" ADD COLUMN "picture_purpose" text DEFAULT 'avatar' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agent_picture_file_owner_fk" FOREIGN KEY ("image_file_id","user_id","picture_purpose") REFERENCES "public"."stored_files"("id","owner_user_id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agent_picture_purpose" CHECK ("user_agents"."picture_purpose" = 'avatar');