DO $$
DECLARE source_table text;
BEGIN
  FOREACH source_table IN ARRAY ARRAY[
    'messaging_conversations', 'messaging_messages', 'messaging_reactions', 'messaging_participants',
    'notifications', 'tasks', 'projects', 'task_comments', 'task_activity',
    'message_entity_references', 'source_task_requests', 'entity_links', 'contacts', 'contact_identifiers',
    'entity_grants', 'entity_access_parents', 'entities', 'actors', 'member', 'invitation',
    'organization', 'organization_pictures', 'session', 'account', 'user', 'user_pictures', 'user_agents'
  ] LOOP
    EXECUTE format('DROP TRIGGER realtime_capture ON %I', source_table);
  END LOOP;
END;
$$;
--> statement-breakpoint
DROP TRIGGER realtime_conversation_access ON messaging_conversations;
--> statement-breakpoint
DROP TRIGGER realtime_profile_conversations ON "user";
--> statement-breakpoint
DROP TRIGGER realtime_profile_conversations ON user_pictures;
--> statement-breakpoint
DROP FUNCTION realtime_capture_change();
--> statement-breakpoint
DROP FUNCTION realtime_capture_conversation_access();
--> statement-breakpoint
DROP FUNCTION realtime_capture_profile_conversations();
--> statement-breakpoint
DROP FUNCTION realtime_change_routes(text, jsonb);
--> statement-breakpoint
DROP TABLE "realtime_outbox";
