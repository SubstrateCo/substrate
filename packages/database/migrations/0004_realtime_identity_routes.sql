-- Audience tuples mirror realtimeKeys. Email matches only route an invitation
-- hint; they do not establish membership, actor identity, or permission.
CREATE OR REPLACE FUNCTION realtime_change_routes(table_name text, row_data jsonb)
RETURNS TABLE(audience jsonb, domain text)
LANGUAGE plpgsql AS $$
BEGIN
  IF row_data IS NULL THEN RETURN; END IF;
  CASE table_name
    WHEN 'messaging_conversations' THEN
      RETURN QUERY SELECT jsonb_build_array('conversation', row_data->>'id'), 'messaging'::text;
    WHEN 'messaging_messages', 'messaging_reactions', 'messaging_participants' THEN
      RETURN QUERY SELECT jsonb_build_array('conversation', row_data->>'conversation_id'), 'messaging'::text;
    WHEN 'notifications' THEN
      RETURN QUERY SELECT jsonb_build_array('actor', row_data->>'organization_id', row_data->>'recipient_actor_entity_id'), 'notifications'::text;
    WHEN 'tasks', 'projects', 'task_comments', 'task_activity' THEN
      RETURN QUERY SELECT jsonb_build_array('organization', row_data->>'organization_id'), 'tasks'::text;
    WHEN 'message_entity_references', 'source_task_requests', 'entity_links', 'contacts', 'contact_identifiers' THEN
      RETURN QUERY SELECT jsonb_build_array('organization', row_data->>'organization_id'), 'context'::text;
    WHEN 'entity_grants', 'entity_access_parents', 'entities', 'actors', 'member' THEN
      RETURN QUERY SELECT jsonb_build_array('organization', row_data->>'organization_id'), 'access'::text;
      IF table_name IN ('member', 'actors') AND row_data->>'user_id' IS NOT NULL THEN
        RETURN QUERY SELECT jsonb_build_array('user', row_data->>'user_id'), 'access'::text;
      END IF;
    WHEN 'invitation' THEN
      RETURN QUERY SELECT jsonb_build_array('organization', row_data->>'organization_id'), 'organization'::text;
      RETURN QUERY SELECT jsonb_build_array('user', u.id), 'organization'::text
        FROM "user" u WHERE u.email = row_data->>'email' AND u.email_verified = true;
    WHEN 'organization' THEN
      RETURN QUERY SELECT jsonb_build_array('organization', row_data->>'id'), 'organization'::text;
    WHEN 'organization_pictures' THEN
      RETURN QUERY SELECT jsonb_build_array('organization', row_data->>'organization_id'), 'organization'::text;
    WHEN 'session', 'account' THEN
      RETURN QUERY SELECT jsonb_build_array('user', row_data->>'user_id'), 'session'::text;
    WHEN 'user' THEN
      RETURN QUERY SELECT jsonb_build_array('user', row_data->>'id'), 'profile'::text;
      RETURN QUERY SELECT jsonb_build_array('organization', m.organization_id), 'profile'::text
        FROM member m WHERE m.user_id = row_data->>'id';
    WHEN 'user_pictures' THEN
      RETURN QUERY SELECT jsonb_build_array('user', row_data->>'user_id'), 'profile'::text;
      RETURN QUERY SELECT jsonb_build_array('organization', m.organization_id), 'profile'::text
        FROM member m WHERE m.user_id = row_data->>'user_id';
    WHEN 'user_agents' THEN
      RETURN QUERY SELECT jsonb_build_array('user', row_data->>'user_id'), 'agents'::text;
      RETURN QUERY SELECT DISTINCT jsonb_build_array('organization', a.organization_id), 'access'::text
        FROM actors a WHERE a.user_agent_id = (row_data->>'id')::uuid;
    ELSE
      RAISE EXCEPTION 'Unmapped realtime table: %', table_name;
  END CASE;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION realtime_capture_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN
    IF old_row = new_row THEN RETURN NULL; END IF;
    IF TG_TABLE_NAME = 'entities' AND
      (old_row - 'updated_at' - 'created_at') = (new_row - 'updated_at' - 'created_at') THEN
      RETURN NULL;
    END IF;
    -- Actor names and configuration are presentation changes, not access changes.
    IF TG_TABLE_NAME = 'actors' AND
      (old_row - 'name' - 'agent_config') = (new_row - 'name' - 'agent_config') THEN
      INSERT INTO realtime_outbox (audience, domain)
        VALUES (jsonb_build_array('organization', new_row->>'organization_id'), 'profile');
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO realtime_outbox (audience, domain)
    SELECT DISTINCT routes.audience, routes.domain
    FROM (VALUES (old_row), (new_row)) AS changed(row_data)
    CROSS JOIN LATERAL realtime_change_routes(TG_TABLE_NAME, changed.row_data) routes;

  IF TG_TABLE_NAME = 'messaging_participants' AND TG_OP IN ('DELETE', 'UPDATE') THEN
    INSERT INTO realtime_outbox (audience, domain)
      VALUES (jsonb_build_array('organization', old_row->>'organization_id'), 'access');
  END IF;
  RETURN NULL;
END;
$$;
