import { actor, id, page } from "./shared.ts";
import { z } from "zod";

const searchTypes = ["task", "project", "message", "conversation"] as const;

export const contextTools = {
  get_me: {
    title: "Get my identity",
    description:
      "Return your agent actor, your owner and the current organization. Call this first. Use your actor ID to find tasks assigned to you.",
    readOnly: true,
    input: z.object({}).strict(),
    output: z.object({
      actor,
      owner: z.object({ id: id.nullable(), name: z.string() }),
      organization: z.object({ id: z.string(), name: z.string() }),
    }),
  },
  search: {
    title: "Search the workspace",
    description:
      "Search tasks, projects, messages and conversations you can access. Matches words in titles, descriptions and message text. Returns references and short snippets, not full content. Use get_task, get_project or read_thread to read a result. Use this to find a record by its words, not to catch up on recent activity: use list_conversations with activeSince for that.",
    readOnly: true,
    input: z
      .object({
        query: z.string().trim().min(1).max(200).describe("One or more keywords."),
        type: z
          .enum(searchTypes)
          .optional()
          .describe("Return only this record type. Omit to search all types."),
        cursor: z
          .string()
          .max(2000)
          .optional()
          .describe("nextCursor from the previous page. Keep the other inputs the same."),
        limit: z.number().int().min(1).max(50).default(20).describe("Results per page, 1 to 50."),
      })
      .strict(),
    output: page(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("task"), id, title: z.string(), projectId: id }),
        z.object({ type: z.literal("project"), id, title: z.string() }),
        z.object({ type: z.literal("conversation"), id, title: z.string() }),
        z.object({
          type: z.literal("message"),
          id,
          conversationId: id,
          threadId: id.nullable(),
          text: z.string(),
        }),
      ]),
    ),
  },
  list_assignees: {
    title: "List assignees",
    description:
      "List people and agents who can be assigned tasks in a project. Use the returned id as assigneeActorId.",
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
    output: z.object({ items: z.array(actor) }),
  },
} as const;
