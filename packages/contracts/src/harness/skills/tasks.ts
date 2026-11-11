import type { HarnessSkill } from "../local.ts";

export const tasksSkill: HarnessSkill = {
  id: "substrate-tasks",
  name: "substrate-tasks",
  description:
    "Use when creating, updating, assigning or commenting on Substrate tasks and projects. Covers statuses, priorities, assignment, subtasks, source messages, comments and bulk changes.",
  content: `# Substrate tasks

## Status

| Status | Use when |
| --- | --- |
| \`not_started\` | Nobody has started the work. This is the default. |
| \`in_progress\` | Someone is working on it now. |
| \`in_review\` | The work is done and waits for someone to check it. |
| \`completed\` | The work is done and accepted. |
| \`canceled\` | The work will not be done. Add a comment that says why. |

Set \`completed\` only when the work is really finished. If someone must check it first, use \`in_review\`.

## Priority

\`none\` (default), \`low\`, \`medium\`, \`high\`, \`urgent\`. Use \`urgent\` only when the work blocks other people now. Do not raise a priority without a reason. Say the reason in a comment.

## Assignment

1. Call \`list_assignees\` with the project ID and part of the name.
2. One match: use its \`id\` as \`assigneeActorId\`.
3. Several matches: do not choose one. Ask your owner which person they mean.
4. No match: create the task unassigned, and say so in your reply.

To find your own tasks, call \`list_tasks\` with \`assigneeActorId: "me"\`. To assign a task to yourself, use your actor ID from \`get_me\`.

## Creating tasks

- Write a short title that starts with a verb, for example "Write launch checklist".
- Put context, links and acceptance criteria in the description. It accepts Markdown.
- If the task comes from a message, set \`sourceMessageId\`. The task then links back to the message. Pasting the message text into the description is not enough.
- For a subtask, set \`parentTaskId\`. A subtask must be in the same project as its parent.
- Before you create a task, search for an existing one with the same work. If you find one, add a comment to it instead.

## Updating tasks

- \`update_task\` changes only the fields you supply and returns the updated task. Check the result.
- Null removes the assignee or the due date.
- A task cannot move to another project or parent.
- To add information, use \`add_task_comment\`. Change the description only to correct it, because \`update_task\` replaces the whole description.

## Links to messages

- \`attach_message\` links a message to a task or project by hand.
- \`detach_message\` removes only hand-made links. Links of kind \`origin\` and \`mention\` stay.
- A link never gives anyone access to the task or the message.

## Links between tasks

- \`add_task_link\` links two tasks. The relation reads from \`taskId\` to \`otherTaskId\`: \`blocks\`, \`blocked_by\`, \`duplicates\`, \`duplicated_by\` or \`relates_to\`.
- Use \`blocked_by\` when the other task must finish first. A task is blocked while a task that blocks it is open.
- A link is a cue. It never changes a status, and no status change is refused because of a link.
- \`get_task\` returns the links. A link whose \`task\` is null points to a task you cannot open. Do not guess what it is.
- \`remove_task_link\` needs the link \`id\` from \`get_task\`.
- To mention a task, project or person in a comment, write \`@[task:<id>]\`, \`@[project:<id>]\` or \`@[person:<actor id>]\`. A mentioned person gets a notification and must be able to open the task.

## Bulk changes

When you change many tasks, first list the changes in your reply. Make the changes one at a time and check each result. Then report what changed and what failed.

## Retries

Generate a new \`requestId\` for each new task, change or comment. Reuse it only to retry the same call after an error.

## Background turns

In background turns, such as routines, do not create or change tasks directly. Use \`propose\` with a \`create_task\` or \`update_task\` action, and your owner approves it.
`,
};
