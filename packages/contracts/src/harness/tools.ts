import { taskPriorityValues, taskStatusValues } from "../tasks/status.ts";
import { z } from "zod";

const id = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const actor = z.object({ id, name: z.string(), type: z.enum(["human", "agent"]) });
const pageInput = {
  cursor: z.string().max(2000).optional(),
  limit: z.number().int().min(1).max(100).default(25),
};
const time = { since: timestamp.optional(), until: timestamp.optional() };
const workRef = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task"), id }).strict(),
  z.object({ type: z.literal("project"), id }).strict(),
]);
const messageRef = z
  .object({ type: z.literal("message"), conversationId: id, messageId: id })
  .strict();
const target = z.union([workRef, messageRef]);
const status = z.enum(taskStatusValues);
const priority = z.enum(taskPriorityValues);
const taskFields = {
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000),
  status,
  priority,
  assigneeActorId: id.nullable(),
  dueDate: z.iso.date().nullable(),
};
const task = z
  .object({
    id,
    projectId: id,
    parentTaskId: id.nullable(),
    ...taskFields,
    assignee: actor.nullable(),
  })
  .omit({ assigneeActorId: true });
const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
type ToolFields = Record<string, z.ZodType>;
const timed = <T extends ToolFields>(fields: T) =>
  z
    .object({ ...fields, ...time })
    .strict()
    .refine((value) => {
      const { since, until } = z.object(time).parse(value);
      return !since || !until || Date.parse(since) < Date.parse(until);
    }, "since must precede until");

export const mcpTools = {
  get_related_context: {
    description:
      "List accessible source, reference, parent and child records. Does not expand record content.",
    readOnly: true,
    input: z.object({ target, ...pageInput }).strict(),
    output: page(
      z.object({
        target,
        relationship: z.enum(["source", "reference", "parent", "child"]),
        label: z.string(),
      }),
    ),
  },
  list_activity: {
    description: "List task activity, newest first, with the actual human or agent actor.",
    readOnly: true,
    input: timed({ taskId: id, ...pageInput }),
    output: page(
      z.object({
        id,
        actor,
        action: z.string(),
        createdAt: timestamp,
        source: messageRef.optional(),
      }),
    ),
  },
  list_projects: {
    description: "List accessible projects without expanding tasks.",
    readOnly: true,
    input: z.object(pageInput).strict(),
    output: page(z.object({ id, name: z.string() })),
  },
  get_project: {
    description:
      "Read a project and a filtered page of task summaries. Omit parentTaskId for all tasks; null selects top-level tasks.",
    readOnly: true,
    input: z
      .object({
        projectId: id,
        statuses: z.array(status).min(1).max(5).optional(),
        assigneeActorId: id.optional(),
        parentTaskId: id.nullable().optional(),
        ...pageInput,
      })
      .strict(),
    output: z.object({
      id,
      name: z.string(),
      description: z.string(),
      tasks: page(task.omit({ projectId: true, description: true })),
    }),
  },
  get_task: {
    description:
      "Read task details. Comments, activity and related records require separate calls.",
    readOnly: true,
    input: z.object({ taskId: id }).strict(),
    output: task,
  },
  create_task: {
    description:
      "Create a task as this agent. Optional source preserves message provenance atomically. Reuse requestId only when retrying identical input.",
    readOnly: false,
    input: z
      .object({
        requestId: id,
        projectId: id,
        ...z.object(taskFields).partial().shape,
        title: taskFields.title,
        parentTaskId: id.optional(),
        source: messageRef.optional(),
      })
      .strict(),
    output: z.object({ taskId: id, createdBy: actor, source: messageRef.nullable() }),
  },
  update_task: {
    description:
      "Update only supplied task fields. Null clears assignee or due date. Does not reparent tasks.",
    readOnly: false,
    input: z
      .object({
        taskId: id,
        changes: z
          .object(taskFields)
          .partial()
          .strict()
          .refine((value) => Object.keys(value).length > 0, "Supply at least one change"),
      })
      .strict(),
    output: z.object({ taskId: id, updatedBy: actor }),
  },
  list_task_comments: {
    description: "List task comments, newest first.",
    readOnly: true,
    input: timed({ taskId: id, ...pageInput }),
    output: page(z.object({ id, author: actor, body: z.string(), createdAt: timestamp })),
  },
  add_task_comment: {
    description: "Add a task comment as this agent. Reuse requestId for identical retries.",
    readOnly: false,
    input: z
      .object({ requestId: id, taskId: id, body: z.string().trim().min(1).max(20000) })
      .strict(),
    output: z.object({ commentId: id, taskId: id, author: actor, createdAt: timestamp }),
  },
  list_conversations: {
    description:
      "List accessible conversations without messages. activeSince includes new thread replies.",
    readOnly: true,
    input: z
      .object({
        ...pageInput,
        kind: z.enum(["dm", "group", "channel"]).optional(),
        activeSince: timestamp.optional(),
      })
      .strict(),
    output: page(
      z.object({
        id,
        kind: z.enum(["dm", "group", "channel"]),
        name: z.string(),
        lastActivityAt: timestamp.nullable(),
      }),
    ),
  },
  list_messages: {
    description:
      "List top-level messages or, with threadId, replies only. since is inclusive; until exclusive. Timeline activeThreads also reports replies to older roots. Never expands reply bodies automatically.",
    readOnly: true,
    input: timed({ conversationId: id, threadId: id.optional(), ...pageInput }),
    output: z.object({
      messages: page(
        z.object({
          id,
          author: actor,
          body: z.string(),
          createdAt: timestamp,
          thread: z.object({ id, replyCount: z.number().int(), lastReplyAt: timestamp }).optional(),
        }),
      ),
      activeThreads: page(
        z.object({
          threadId: id,
          rootMessageId: id,
          replyCountInWindow: z.number().int(),
          lastReplyAt: timestamp,
        }),
      ).optional(),
    }),
  },
  send_message: {
    description:
      "Send a message as this agent, or reply using threadId (the root message ID). Reuse requestId for identical retries.",
    readOnly: false,
    input: z
      .object({
        requestId: id,
        conversationId: id,
        threadId: id.optional(),
        body: z.string().trim().min(1).max(20000),
      })
      .strict(),
    output: z.object({
      messageId: id,
      conversationId: id,
      threadId: id.nullable(),
      author: actor,
      createdAt: timestamp,
    }),
  },
  attach_reference: {
    description:
      "Idempotently link a message to a task or project. Does not grant access or create provenance.",
    readOnly: false,
    input: z.object({ message: messageRef, target: workRef }).strict(),
    output: z.object({ attached: z.literal(true), changed: z.boolean(), actedBy: actor }),
  },
  remove_reference: {
    description:
      "Remove only a manual message reference. Preserves provenance and content-derived references.",
    readOnly: false,
    input: z.object({ message: messageRef, target: workRef }).strict(),
    output: z.object({ attached: z.literal(false), changed: z.boolean(), actedBy: actor }),
  },
} as const;

export type McpToolName = keyof typeof mcpTools;
export type McpInput<K extends McpToolName> = z.output<(typeof mcpTools)[K]["input"]>;
export type McpOutput<K extends McpToolName> = z.output<(typeof mcpTools)[K]["output"]>;
// SAFETY: these keys come directly from the nonempty tool registry above.
const mcpToolName = z.enum(Object.keys(mcpTools) as [McpToolName, ...McpToolName[]]);
export const mcpCall = z
  .object({
    tool: mcpToolName,
    input: z.record(z.string(), z.json()),
    organizationId: z.string().min(1),
    agentId: id,
  })
  .strict();
