-- A viewer who just lost public visibility cannot receive a conversation event.
-- Reset the owner workspace without exposing the now-private conversation ID.
CREATE FUNCTION realtime_capture_conversation_access() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.id, OLD.organization_id, OLD.kind, OLD.private, OLD.created_by)
      IS NOT DISTINCT FROM
      ROW(NEW.id, NEW.organization_id, NEW.kind, NEW.private, NEW.created_by) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- SQL tuples mirror realtimeKeys; triggers must also support non-JS writers.
  INSERT INTO realtime_outbox (audience, domain)
    SELECT DISTINCT jsonb_build_array('organization', owners.organization_id), 'access'
    FROM (VALUES (OLD.organization_id),
      (CASE WHEN TG_OP = 'UPDATE' THEN NEW.organization_id ELSE OLD.organization_id END)
    ) AS owners(organization_id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER realtime_conversation_access
AFTER UPDATE OR DELETE ON messaging_conversations
FOR EACH ROW EXECUTE FUNCTION realtime_capture_conversation_access();
--> statement-breakpoint
CREATE FUNCTION realtime_capture_profile_conversations() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_user_id text;
  new_user_id text;
BEGIN
  IF TG_TABLE_NAME = 'user' THEN
    IF TG_OP = 'UPDATE' THEN
      IF ROW(OLD.name, OLD.image) IS NOT DISTINCT FROM ROW(NEW.name, NEW.image) THEN
        RETURN NULL;
      END IF;
    END IF;
    IF TG_OP <> 'INSERT' THEN old_user_id := OLD.id; END IF;
    IF TG_OP <> 'DELETE' THEN new_user_id := NEW.id; END IF;
  ELSE
    IF TG_OP = 'UPDATE' THEN
      IF ROW(OLD.user_id, OLD.file_id) IS NOT DISTINCT FROM ROW(NEW.user_id, NEW.file_id) THEN
        RETURN NULL;
      END IF;
    END IF;
    IF TG_OP <> 'INSERT' THEN old_user_id := OLD.user_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_user_id := NEW.user_id; END IF;
  END IF;

  -- The message author FK requires a matching participant, including historical
  -- authors. The indexed participant lookup therefore covers both author names
  -- and participant/DM labels without scanning the message history.
  -- Delivery still checks visibleConversations in each recipient's workspace.
  INSERT INTO realtime_outbox (audience, domain)
    SELECT DISTINCT jsonb_build_array('conversation', p.conversation_id), 'profile'
    FROM messaging_participants p WHERE p.user_id IN (old_user_id, new_user_id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER realtime_profile_conversations
AFTER INSERT OR UPDATE OR DELETE ON "user"
FOR EACH ROW EXECUTE FUNCTION realtime_capture_profile_conversations();
--> statement-breakpoint
CREATE TRIGGER realtime_profile_conversations
AFTER INSERT OR UPDATE OR DELETE ON user_pictures
FOR EACH ROW EXECUTE FUNCTION realtime_capture_profile_conversations();
