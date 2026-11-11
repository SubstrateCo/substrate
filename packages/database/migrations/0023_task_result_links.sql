-- Task results stored before task links existed have no links. Replays now require the list.
UPDATE "agent_tool_requests"
SET "result" = jsonb_set("result", '{links}', '[]'::jsonb)
WHERE "tool" IN ('create_task', 'update_task', 'add_task_link', 'remove_task_link')
  AND jsonb_typeof("result") = 'object'
  AND NOT ("result" ? 'links');
