CREATE TABLE "file_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" text,
	"organization_id" text,
	"uploaded_by" text NOT NULL,
	"purpose" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"temporary_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"temporary_cleaned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_uploads_temporary_key_unique" UNIQUE("temporary_key"),
	CONSTRAINT "file_upload_owner" CHECK (("file_uploads"."purpose" = 'avatar' AND "file_uploads"."owner_user_id" IS NOT NULL AND "file_uploads"."organization_id" IS NULL AND "file_uploads"."uploaded_by" = "file_uploads"."owner_user_id") OR ("file_uploads"."purpose" IN ('organization-logo', 'file') AND "file_uploads"."organization_id" IS NOT NULL AND "file_uploads"."owner_user_id" IS NULL)),
	CONSTRAINT "file_upload_size" CHECK ("file_uploads"."size" > 0 AND "file_uploads"."size" <= 5242880)
);
--> statement-breakpoint
CREATE TABLE "organization_pictures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	"purpose" text DEFAULT 'organization-logo' NOT NULL,
	CONSTRAINT "organization_pictures_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "organization_picture_purpose" CHECK ("organization_pictures"."purpose" = 'organization-logo')
);
--> statement-breakpoint
CREATE TABLE "storage_candidates" (
	"object_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" text,
	"organization_id" text,
	"uploaded_by" text NOT NULL,
	"purpose" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_files_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "stored_file_user_purpose" UNIQUE("id","owner_user_id","purpose"),
	CONSTRAINT "stored_file_organization_purpose" UNIQUE("id","organization_id","purpose"),
	CONSTRAINT "stored_file_owner" CHECK (("stored_files"."purpose" = 'avatar' AND "stored_files"."owner_user_id" IS NOT NULL AND "stored_files"."organization_id" IS NULL AND "stored_files"."uploaded_by" = "stored_files"."owner_user_id") OR ("stored_files"."purpose" IN ('organization-logo', 'file') AND "stored_files"."organization_id" IS NOT NULL AND "stored_files"."owner_user_id" IS NULL)),
	CONSTRAINT "stored_file_size" CHECK ("stored_files"."size" > 0 AND "stored_files"."size" <= 5242880),
	CONSTRAINT "stored_file_image_type" CHECK ("stored_files"."purpose" = 'file' OR "stored_files"."content_type" = 'image/webp')
);
--> statement-breakpoint
CREATE TABLE "user_pictures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	"purpose" text DEFAULT 'avatar' NOT NULL,
	CONSTRAINT "user_pictures_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_picture_purpose" CHECK ("user_pictures"."purpose" = 'avatar')
);
--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_pictures" ADD CONSTRAINT "organization_pictures_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_pictures" ADD CONSTRAINT "organization_picture_file_owner_fk" FOREIGN KEY ("file_id","organization_id","purpose") REFERENCES "public"."stored_files"("id","organization_id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pictures" ADD CONSTRAINT "user_pictures_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pictures" ADD CONSTRAINT "user_picture_file_owner_fk" FOREIGN KEY ("file_id","user_id","purpose") REFERENCES "public"."stored_files"("id","owner_user_id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_upload_expiry_idx" ON "file_uploads" USING btree ("expires_at");