CREATE OR REPLACE FUNCTION require_message_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'messaging_messages' THEN
    target_id := NEW.id;
  ELSE
    target_id := OLD.message_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM messaging_messages m
    WHERE m.id = target_id AND m.deleted_at IS NULL AND length(btrim(m.body)) = 0
      AND NOT EXISTS (SELECT 1 FROM message_attachments a WHERE a.message_id = m.id)
  ) THEN
    RAISE EXCEPTION 'A message needs text or an attachment.' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
