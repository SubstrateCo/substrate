import type { McpInput, ServerToolName } from "@substrate/contracts/harness/tools";
import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

const personMention = /@\[person:([0-9a-f-]{36})\]/gi;

type ToolExecution = {
  [K in ServerToolName]: { tool: K; input: McpInput<K>; hints: RealtimeHint[] };
}[ServerToolName];

/**
 * Who refreshes after an agent tool call. Each write names the views it changed. `hints` are the
 * message hints the write built in its transaction, so nothing is read back after commit.
 */
export function toolHints(
  execution: ToolExecution,
  scope: { organizationId: string; userId: string },
): RealtimeHint[] {
  const organization = realtimeKeys.organization(scope.organizationId);
  const tasks: RealtimeHint = { audience: organization, domain: "tasks" };
  const context: RealtimeHint = { audience: organization, domain: "context" };
  // Replies, questions and proposals change what the owner's agent-work views show.
  const agentWork: RealtimeHint = {
    audience: realtimeKeys.user(scope.userId),
    domain: "agent-work",
  };
  const assigned = (assignee: string | null | undefined): RealtimeHint[] =>
    assignee
      ? [
          {
            audience: realtimeKeys.actor(scope.organizationId, assignee),
            domain: "notifications",
          },
        ]
      : [];
  switch (execution.tool) {
    case "create_task":
      return [
        tasks,
        ...(execution.input.sourceMessageId ? [context] : []),
        ...assigned(execution.input.assigneeActorId),
      ];
    case "update_task":
      return [tasks, ...assigned(execution.input.changes.assigneeActorId)];
    case "add_task_comment":
      // A comment alerts the people it mentions. The server rejects a mention it cannot deliver.
      return [
        tasks,
        ...[...execution.input.body.matchAll(personMention)].flatMap((match) =>
          assigned(match[1]!.toLowerCase()),
        ),
      ];
    case "add_task_link":
    case "remove_task_link":
      return [tasks];
    case "attach_message":
    case "detach_message":
      return [context];
    case "reply":
      return [...execution.hints, agentWork];
    case "propose":
      return [agentWork];
    // Reads change nothing. A new tool must be listed here or above.
    case "get_me":
    case "search":
    case "list_assignees":
    case "list_projects":
    case "get_project":
    case "list_tasks":
    case "get_task":
    case "list_task_activity":
    case "list_task_comments":
    case "list_conversations":
    case "read_conversation":
    case "read_thread":
    case "list_links":
      return [];
  }
}
