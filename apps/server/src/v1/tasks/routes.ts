import {
  tasksWorkspace,
  projectRequest,
  taskRequest,
  tasksWrite,
  workRequest,
} from "@substrate/contracts/tasks/input";

import { respond, validationHook } from "../../shared/http";
import {
  listProjects,
  getProject,
  listTaskComments,
  listCommentMentions,
  mutateTasks,
} from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createTasksRoutes(
  services = { listProjects, getProject, listTaskComments, listCommentMentions, mutateTasks },
) {
  return new Hono()
    .get("/projects", zValidator("query", tasksWorkspace, validationHook), async (c) =>
      respond(c, await services.listProjects(c.req.raw.headers, c.req.valid("query"))),
    )
    .get("/project", zValidator("query", projectRequest, validationHook), async (c) =>
      respond(c, await services.getProject(c.req.raw.headers, c.req.valid("query"))),
    )
    .get("/comments", zValidator("query", taskRequest, validationHook), async (c) =>
      respond(c, await services.listTaskComments(c.req.raw.headers, c.req.valid("query"))),
    )
    .get("/comment-mentions", zValidator("query", workRequest, validationHook), async (c) =>
      respond(c, await services.listCommentMentions(c.req.raw.headers, c.req.valid("query"))),
    )
    .post("/mutations", zValidator("json", tasksWrite, validationHook), async (c) =>
      respond(c, await services.mutateTasks(c.req.raw.headers, c.req.valid("json"))),
    );
}
