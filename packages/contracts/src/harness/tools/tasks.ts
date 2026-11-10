import { taskPriorityValues, taskStatusValues } from "../../tasks/status.ts";
import {
  actor,
  author,
  id,
  messageRef,
  page,
  pageInput,
  requestId,
  timed,
  timestamp,
} from "./shared.ts";
import { z } from "zod";

const status = z
  .enum(taskStatusValues)
  .describe("not_started | in_progress | in_review (waiting for review) | completed | canceled");
const priority = z.enum(taskPriorityValues).describe("none | low | medium | high | urgent");
const taskFields = {
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000).describe("Markdown."),
  status,
  priority,
  assigneeActorId: id
    .nullable()
    .describe("An actor ID from list_assignees or get_me. Null removes the assignee."),
  dueDate: z.iso.date().nullable().describe("YYYY-MM-DD. Null removes the due date."),
};
const taskSummary = z.object({
  id,
  title: z.string(),
  status: z.enum(taskStatusValues),
  priority: z.enum(taskPriorityValues),
  assignee: actor.nullable(),
  dueDate: z.iso.date().nullable(),
  parentTaskId: id.nullable(),
  updatedAt: timestamp,
});
/** What get_task, create_task and update_task return. */
export const taskResult = z.object({
  id,
  title: z.string(),
  description: z.string(),
  status: z.enum(taskStatusValues),
  priority: z.enum(taskPriorityValues),
  assignee: actor.nullable(),
  dueDate: z.iso.date().nullable(),
  project: z.object({ id, name: z.string() }),
  parent: z.object({ id, title: z.string() }).nullable(),
  subtaskCount: z.number().int(),
  source: messageRef.nullable().describe("The message this task was created from."),
  commentCount: z.number().int(),
  linkedMessageCount: z.number().int(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
/** Every status is present, with 0 when no task has it. */
const taskCounts = z.record(z.enum(taskStatusValues), z.number().int());

export const taskTools = {
  list_projects: {
    title: "List projects",
    description:
      "List projects you can access, sorted by name. Use list_tasks to see a project's tasks.",
    readOnly: true,
    input: z.object(pageInput).strict(),
    output: page(z.object({ id, name: z.string() })),
  },
  get_project: {
    title: "Get project",
    description:
      "Read a project's name, description and task counts by status. Use list_tasks for the tasks themselves.",
    readOnly: true,
    input: z.object({ projectId: id }).strict(),
    output: z.object({ id, name: z.string(), description: z.string(), taskCounts }),
  },
  list_tasks: {
    title: "List tasks",
    description:
      'List task summaries in a project, most recently updated first. Filter by status, assignee (an actor ID, or "me" for your own tasks) or parent task. parentTaskId null returns only top-level tasks.',
    readOnly: true,
    input: z
      .object({
        projectId: id,
        statuses: z.array(z.enum(taskStatusValues)).min(1).max(5).optional(),
        assigneeActorId: z
          .union([id, z.literal("me")])
          .optional()
          .describe('An actor ID, or "me" for tasks assigned to you.'),
        parentTaskId: id
          .nullable()
          .optional()
          .describe("A task ID returns its subtasks. Null returns top-level tasks. Omit for all."),
        ...pageInput,
      })
      .strict(),
    output: page(taskSummary),
  },
  get_task: {
    title: "Get task",
    description:
      "Read a task in full: description, assignee, project, parent, subtask count, the message it was created from, and counts of comments and linked messages. Use list_task_comments, list_task_activity or list_links for more.",
    readOnly: true,
    input: z.object({ taskId: id }).strict(),
    output: taskResult,
  },
  create_task: {
    title: "Create task",
    description:
      "Create a task as yourself. If the task comes from a message, set sourceMessageId so the task links back to it. Defaults: status not_started, priority none. Returns the new task.",
    readOnly: false,
    idempotent: true,
    input: z
      .object({
        requestId,
        projectId: id,
        ...z.object(taskFields).partial().shape,
        title: taskFields.title,
        parentTaskId: id.optional().describe("Create the task as a subtask of this task."),
        sourceMessageId: id.optional().describe("The message this work comes from."),
      })
      .strict(),
    output: taskResult,
  },
  update_task: {
    title: "Update task",
    description:
      "Change only the fields you supply. Null clears the assignee or due date. Cannot move a task to another project or parent. Returns the updated task.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: z
      .object({
        requestId,
        taskId: id,
        changes: z
          .object(taskFields)
          .partial()
          .strict()
          .refine((value) => Object.keys(value).length > 0, "Supply at least one change"),
      })
      .strict(),
    output: taskResult,
  },
  list_task_comments: {
    title: "List task comments",
    description: "List a task's comments, newest first.",
    readOnly: true,
    input: timed({ taskId: id, ...pageInput }),
    output: page(z.object({ id, author, body: z.string(), createdAt: timestamp })),
  },
  add_task_comment: {
    title: "Add task comment",
    description: "Add a comment to a task as yourself.",
    readOnly: false,
    idempotent: true,
    input: z
      .object({
        requestId,
        taskId: id,
        body: z.string().trim().min(1).max(20000).describe("Markdown."),
      })
      .strict(),
    output: z.object({ id, taskId: id, createdAt: timestamp }),
  },
  list_task_activity: {
    title: "List task activity",
    description:
      "List a task's change history, newest first, showing who made each change. An event may link to the message that caused it.",
    readOnly: true,
    input: timed({ taskId: id, ...pageInput }),
    output: page(
      z.object({
        id,
        actor,
        action: z.string(),
        createdAt: timestamp,
        source: messageRef.nullable(),
      }),
    ),
  },
} as const;
