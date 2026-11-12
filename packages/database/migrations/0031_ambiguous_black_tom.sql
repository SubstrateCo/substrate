ALTER TABLE "messaging_conversations" ADD COLUMN "dm_key" text;--> statement-breakpoint
-- Match the compact JSON tuples used by the repository. Older duplicate DMs stay unkeyed.
WITH internal_pairs AS (
  SELECT c.id, c.organization_id, c.created_at,
    array_agg(p.actor_entity_id::text ORDER BY p.actor_entity_id::text) AS actors
  FROM messaging_conversations c
  JOIN messaging_participants p ON p.conversation_id = c.id
  -- Agent authorship rows are not DM recipients: they are inserted already left.
  WHERE c.kind = 'dm' AND (p.actor_type = 'human' OR p.left_at IS NULL)
  GROUP BY c.id
  HAVING count(*) = 2 AND bool_and(p.organization_id = c.organization_id)
), candidates AS (
  SELECT id, created_at,
    array_to_json(ARRAY['dm', organization_id, actors[1], actors[2]])::text AS dm_key
  FROM internal_pairs
  UNION ALL
  SELECT c.id, c.created_at,
    array_to_json(ARRAY['dm-email', c.organization_id, c.created_by, lower(trim(target.email))])::text
  FROM messaging_conversations c
  CROSS JOIN LATERAL (
    SELECT email FROM (
      SELECT i.email, 0 AS priority, i.created_at
      FROM messaging_invitations i
      WHERE i.conversation_id = c.id AND i.sender_organization_id = c.organization_id
      UNION ALL
      SELECT u.email, 1 AS priority, c.created_at
      FROM messaging_participants p
      JOIN actors a ON a.entity_id = p.actor_entity_id
      JOIN "user" u ON u.id = a.user_id
      WHERE p.conversation_id = c.id AND u.id <> c.created_by
    ) emails ORDER BY priority, created_at DESC, email LIMIT 1
  ) target
  WHERE c.kind = 'dm' AND NOT EXISTS (SELECT 1 FROM internal_pairs p WHERE p.id = c.id)
), ranked AS (
  SELECT id, dm_key, row_number() OVER (PARTITION BY dm_key ORDER BY created_at DESC, id DESC) AS rank
  FROM candidates
)
UPDATE messaging_conversations c SET dm_key = ranked.dm_key
FROM ranked WHERE c.id = ranked.id AND ranked.rank = 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_conversations_dm_key_unique" ON "messaging_conversations" USING btree ("dm_key") WHERE "messaging_conversations"."dm_key" IS NOT NULL;
