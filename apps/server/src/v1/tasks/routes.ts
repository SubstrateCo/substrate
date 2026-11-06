import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  tasksWorkspace,
  projectRequest,
  taskRequest,
  tasksWrite,
} from "@startup-os/contracts/tasks/input";
import { respond, validationHook } from "../../shared/http";
import * as defaultServices from "./service";

export function createTasksRoutes(services = defaultServices) {
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
    .post("/mutations", zValidator("json", tasksWrite, validationHook), async (c) =>
      respond(c, await services.mutateTasks(c.req.raw.headers, c.req.valid("json"))),
    );
}
