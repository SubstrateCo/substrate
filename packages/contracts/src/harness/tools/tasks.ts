import { taskLinkRelations } from "../../tasks/links.ts";
import { permissionLevels, taskPriorityValues, taskStatusValues } from "../../tasks/status.ts";
import { recordLinks } from "./links.ts";
import { actor, id, messageRef, page, pageInput, requestId, timed, timestamp } from "./shared.ts";
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
const relation = z
  .enum(taskLinkRelations)
  .describe(
    "How the task relates to the other task: blocks | blocked_by | duplicates | duplicated_by | related_to",
  );
const taskLink = z.object({
  id,
  relation,
  task: z
    .object({
      id,
      title: z.string(),
      status: z.enum(taskStatusValues),
      project: z.object({ id, name: z.string() }),
    })
    .nullable()
    .describe("The other task. Null when you cannot open it."),
  blocking: z.boolean().describe("True for a blocks link whose blocking task is still open."),
});
/** What get_task and the task write tools return. */
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
  discussionConversationId: id
    .nullable()
    .describe("The shared task discussion, if it has been opened."),
  links: z.array(taskLink).describe("Links to other tasks."),
  linked: recordLinks.describe(
    "Linked messages and non-task records you can read. Links to other tasks are in links.",
  ),
  createdAt: timestamp,
  updatedAt: timestamp,
});
/** Every status is present, with 0 when no task has it. */
const taskCounts = z.record(z.enum(taskStatusValues), z.number().int());
const level = z.enum(permissionLevels);
const archived = z
  .boolean()
  .describe("An archived project and its tasks are read-only until an owner restores it.");
const projectName = z.string().trim().min(1).max(200);
const projectDescription = z.string().max(20000).describe("Markdown.");
/** What get_project and the project write tools return. */
const projectResult = z.object({
  id,
  name: z.string(),
  description: z.string(),
  archived,
  yourLevel: level.describe(
    "Your access: view | comment | edit | owner. Changes need edit; archive, delete and sharing need owner.",
  ),
  members: z
    .array(z.object({ actor, level }))
    .describe(
      "People with direct access. Organization owners and admins also have owner access without being listed.",
    ),
  taskCounts,
  linked: recordLinks,
});

export const taskTools = {
  list_projects: {
    title: "List projects",
    description:
      "List projects you can access, sorted by name. Archived projects are left out unless you set archived. Use list_tasks to see a project's tasks.",
    readOnly: true,
    input: z
      .object({
        archived: z
          .enum(["active", "archived", "all"])
          .default("active")
          .describe("active (default) | archived | all"),
        ...pageInput,
      })
      .strict(),
    output: page(z.object({ id, name: z.string(), archived })),
  },
  get_project: {
    title: "Get project",
    description:
      "Read a project's name, description, archived state, your access level, its members, task counts by status, and its linked messages and records. Use list_tasks for the tasks themselves.",
    readOnly: true,
    input: z.object({ projectId: id }).strict(),
    output: projectResult,
  },
  create_project: {
    title: "Create project",
    description:
      "Create a project as yourself. Your owner becomes its owner; share it with propose and a share_project action. Before you create one, look for an existing project with search_names. Returns the new project.",
    readOnly: false,
    idempotent: true,
    input: z
      .object({
        requestId,
        name: projectName,
        description: projectDescription.optional(),
      })
      .strict(),
    output: projectResult,
  },
  update_project: {
    title: "Update project",
    description:
      "Change a project's name or description. Only the fields you supply change; a description replaces the whole text. Needs edit access on a project that is not archived. Returns the updated project.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: z
      .object({
        requestId,
        projectId: id,
        changes: z
          .object({ name: projectName, description: projectDescription })
          .partial()
          .strict()
          .refine((value) => Object.keys(value).length > 0, "Supply at least one change"),
      })
      .strict(),
    output: projectResult,
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
      "Read a task in full, including its source message, shared discussion conversation ID, task links, and its newest linked messages and records. Use read_conversation for an existing discussion, get_task_discussion to open one, or list_task_activity for change history.",
    readOnly: true,
    input: z.object({ taskId: id }).strict(),
    output: taskResult,
  },
  create_task: {
    publishes: [{ kind: "task", id: "id" }],
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
    publishes: [{ kind: "task", id: "id" }],
    title: "Update task",
    description:
      "Change only the fields you supply. Null clears the assignee or due date. Use move_task to change the project or parent. Returns the updated task.",
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
  move_task: {
    publishes: [{ kind: "task", id: "id" }],
    title: "Move task",
    description:
      "Move a task, with all its subtasks, to another project or under another parent. Set projectId to the task's own project to change only the parent. parentTaskId null makes it a top-level task; a parent must be in the destination project and cannot be the task or one of its subtasks. Needs edit access on both projects, and every assignee must be able to access the destination. Returns the moved task.",
    readOnly: false,
    idempotent: true,
    input: z
      .object({
        requestId,
        taskId: id,
        projectId: id.describe("The destination project."),
        parentTaskId: id
          .nullable()
          .describe("The new parent task in the destination project, or null for top level."),
      })
      .strict(),
    output: taskResult,
  },
  get_task_discussion: {
    title: "Get task discussion",
    description:
      "Open a task's shared messaging discussion, creating it if needed. Task view access permits reading; comment access is required to post. Use read_conversation to read it and reply or propose to publish. This tool does not post a message or wake an agent.",
    readOnly: false,
    idempotent: true,
    input: z
      .object({
        requestId,
        taskId: id,
      })
      .strict(),
    output: z.object({ conversationId: id }),
  },
  add_task_link: {
    title: "Add task link",
    description:
      "Link a task to another task as yourself. The relation reads from taskId to otherTaskId: blocked_by means otherTaskId must finish first. A link never changes a status. Returns the task with its links.",
    readOnly: false,
    idempotent: true,
    input: z.object({ requestId, taskId: id, relation, otherTaskId: id }).strict(),
    output: taskResult,
  },
  remove_task_link: {
    title: "Remove task link",
    description:
      "Remove a link from a task. Use a link id from the task's links. Returns the task with its remaining links.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: z.object({ requestId, taskId: id, linkId: id }).strict(),
    output: taskResult,
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
