ALTER TABLE "stored_files" DROP CONSTRAINT "stored_files_uploaded_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "stored_files" ALTER COLUMN "uploaded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;