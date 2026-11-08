DROP TRIGGER organization_picture_sync ON organization;
--> statement-breakpoint
DROP TRIGGER user_picture_sync ON "user";
--> statement-breakpoint
DROP FUNCTION sync_organization_picture();
--> statement-breakpoint
DROP FUNCTION sync_user_picture();
--> statement-breakpoint
DROP TABLE "organization_pictures" CASCADE;
--> statement-breakpoint
DROP TABLE "user_pictures" CASCADE;
