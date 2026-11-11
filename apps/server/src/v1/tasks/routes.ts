import {
  tasksWorkspace,
  projectRequest,
  taskRequest,
  taskLocationRequest,
  tasksWrite,
  workRequest,
} from "@substrate/contracts/tasks/input";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { TasksService } from "./service";
import { Hono } from "hono";

export function createTasksRoutes(services: TasksService, scopes: Scopes) {
  return new Hono<ScopeEnv>()
    .get("/task-location", v("query", taskLocationRequest), scopes.workspace("query"), async (c) =>
      respond(c, await services.getTaskLocation(c.var.scope, c.req.valid("query"))),
    )
    .get("/projects", v("query", tasksWorkspace), scopes.workspace("query"), async (c) =>
      respond(c, await services.listProjects(c.var.scope, c.req.valid("query"))),
    )
    .get("/project", v("query", projectRequest), scopes.workspace("query"), async (c) =>
      respond(c, await services.getProject(c.var.scope, c.req.valid("query"))),
    )
    .get("/comments", v("query", taskRequest), scopes.workspace("query"), async (c) =>
      respond(c, await services.listTaskComments(c.var.scope, c.req.valid("query"))),
    )
    .get("/comment-mentions", v("query", workRequest), scopes.workspace("query"), async (c) =>
      respond(c, await services.listCommentMentions(c.var.scope, c.req.valid("query"))),
    )
    .post("/mutations", v("json", tasksWrite), scopes.workspace("json"), async (c) =>
      respond(c, await services.mutateTasks(c.var.scope, c.req.valid("json"))),
    );
}
