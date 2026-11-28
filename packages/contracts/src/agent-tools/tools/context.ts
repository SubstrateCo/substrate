import { conversationKind } from "../../messaging/input.ts";
import { taskPriorityValues, taskStatusValues } from "../../tasks/status.ts";
import { messageRecord } from "./links.ts";
import { actor, author, excerpt, id, page, timestamp } from "./shared.ts";
import { z } from "zod";

const searchInput = <T extends readonly [string, ...string[]]>(types: T) =>
  z
    .object({
      query: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .describe("1 to 3 distinctive words that appear in what you want to find."),
      type: z
        .enum(types)
        .optional()
        .describe(
          "Return only this type. Omit it unless the request clearly names one type; keep it on follow-ups.",
        ),
      cursor: z
        .string()
        .max(2000)
        .optional()
        .describe("nextCursor from the previous page. Keep the other inputs the same."),
      limit: z.number().int().min(1).max(50).default(20).describe("Results per page, 1 to 50."),
    })
    .strict();
const taskHit = z.object({
  type: z.literal("task"),
  id,
  title: z.string(),
  projectId: id,
  projectName: z.string(),
  status: z.enum(taskStatusValues),
  priority: z.enum(taskPriorityValues),
  dueDate: z.iso.date().nullable(),
  updatedAt: timestamp,
});
const projectHit = z.object({
  type: z.literal("project"),
  id,
  title: z.string(),
  archived: z.boolean().describe("An archived project is read-only: new work does not go there."),
  updatedAt: timestamp,
});

export const contextTools = {
  get_me: {
    title: "Get my identity",
    description:
      "Return your agent actor, your owner's actor and the current organization. Call it only when you need one of these IDs, for example to mention your owner.",
    readOnly: true,
    input: z.object({}).strict(),
    output: z.object({
      actor,
      owner: z.object({ id: id.nullable(), name: z.string() }),
      organization: z.object({ id: z.string(), name: z.string() }),
    }),
  },
  search_names: {
    title: "Search by name",
    description:
      'Find a channel, project or task by part of its name, ignoring case: "launch" finds "Q3 Launch plan". Newest activity first. Use it to find a channel, or a record whose name you know. search_content also matches task and project titles, so do not run both searches for the same words. Use list_conversations with activeSince to catch up on recent activity. This does not find people. DMs and group chats often have no name: use list_conversations to find them by person.',
    readOnly: true,
    input: searchInput(["task", "project", "conversation"] as const),
    output: page(
      z.discriminatedUnion("type", [
        taskHit,
        projectHit,
        z.object({
          type: z.literal("conversation"),
          id,
          title: z.string(),
          kind: conversationKind,
          lastActivityAt: timestamp,
        }),
      ]),
    ),
  },
  search_content: {
    title: "Search by content",
    description:
      'Find tasks, projects and messages by words in their text: task and project titles and descriptions, and message bodies. One call covers titles too, so it is the only search you need for a task. A task hit shows its status, priority, due date and project, so you often need no further read. Every word must appear, as a whole word or the start of one: "deplo fail" finds "the deploy failed". Not semantic: use words that literally appear in the text, not a description of it. Newest first. Each message lists the records it references; use read_thread to read it in full, and the read tool of its app to open a record. Use list_conversations with activeSince, not this tool, to catch up on recent activity.',
    readOnly: true,
    input: searchInput(["task", "project", "message"] as const),
    output: page(
      z.discriminatedUnion("type", [
        taskHit,
        projectHit,
        z.object({
          type: z.literal("message"),
          id,
          conversationId: id,
          threadId: id.nullable(),
          author,
          ...excerpt,
          createdAt: timestamp,
          records: z.array(messageRecord),
        }),
      ]),
    ),
  },
  list_assignees: {
    title: "List assignees",
    description:
      "Find people and agents in the workspace by name, as a project sees them. Use the returned id as assigneeActorId, or as actorId to share the project. assignable false means the person cannot open this project yet: share the project with them first, then assign. Any project you can open finds every person.",
    readOnly: true,
    input: z
      .object({
        projectId: id,
        query: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe("Return only names that contain this text, ignoring case."),
      })
      .strict(),
    output: z.object({
      items: z.array(
        actor.extend({
          assignable: z
            .boolean()
            .describe("False: share the project with this person before you assign them."),
        }),
      ),
    }),
  },
} as const;
