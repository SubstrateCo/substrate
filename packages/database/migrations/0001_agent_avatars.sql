ALTER TABLE "user_agents" DROP CONSTRAINT "user_agent_picture_purpose";--> statement-breakpoint
ALTER TABLE "user_agents" DROP CONSTRAINT "user_agent_picture_file_owner_fk";
--> statement-breakpoint
DROP INDEX "user_agents_image_file_idx";--> statement-breakpoint
ALTER TABLE "user_agents" DROP COLUMN "image_file_id";--> statement-breakpoint
ALTER TABLE "user_agents" DROP COLUMN "picture_purpose";--> statement-breakpoint
ALTER TABLE "user_agents" ADD COLUMN "avatar_code" text;--> statement-breakpoint
-- Existing agents get a look seeded by their ID: body, colour, gradient fill, eye style, and an
-- eye colour that stays readable on that body colour. See encodeAvatarCode for the positions.
UPDATE "user_agents" SET "avatar_code" = codes.code
FROM (
  SELECT id, '1' || substr('012345', (h % 6)::int + 1, 1) || colour || '0'
    || substr('012345', ((h / 66) % 6)::int + 1, 1)
    || CASE WHEN colour IN ('3', '4', '5', '6', '7', '9', 'a') THEN '5' ELSE '0' END AS code
  FROM (
    SELECT id, h, substr('0123456789a', ((h / 6) % 11)::int + 1, 1) AS colour
    FROM (SELECT id, abs(hashtext(id::text)::bigint) AS h FROM "user_agents") hashed
  ) coloured
) codes
WHERE codes.id = "user_agents".id;--> statement-breakpoint
ALTER TABLE "user_agents" ALTER COLUMN "avatar_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agents_avatar_code_check" CHECK ("user_agents"."avatar_code" ~ '^1[0-9a-z]{5}$');