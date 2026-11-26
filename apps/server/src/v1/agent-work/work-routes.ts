import {
  agentActivityInput,
  approveRoutineInput,
  listRoutinesInput,
  ownerCreateRoutineInput,
  ownerDeleteRoutineInput,
  ownerUpdateRoutineInput,
  routineParams,
  workCommandInput,
  workParams,
  workReadInput,
} from "@substrate/contracts/agent-work";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { WorkService } from "./work-service";
import { Hono } from "hono";

/**
 * The owner's agent work under /agent-work, from any of the owner's devices. Every route is
 * workspace scoped and reaches only the caller's own agents.
 */
export function createWorkRoutes(work: WorkService, scopes: Scopes) {
  const command = <P extends string>(path: P) =>
    [path, v("param", workParams), v("json", workCommandInput), scopes.workspace("json")] as const;
  return new Hono<ScopeEnv>()
    .get(
      "/agents/:id/activity",
      v("param", workParams),
      v("query", agentActivityInput),
      scopes.workspace("query"),
      async (c) =>
        respond(c, await work.activity(c.var.scope, c.req.valid("param").id, c.req.valid("query"))),
    )
    .get(
      "/agents/:id/routines",
      v("param", workParams),
      v("query", listRoutinesInput),
      scopes.workspace("query"),
      async (c) => respond(c, await work.listRoutines(c.var.scope, c.req.valid("param").id)),
    )
    .get(
      "/conversations/:id/work",
      v("param", workParams),
      v("query", workReadInput),
      scopes.workspace("query"),
      async (c) => respond(c, await work.conversationWork(c.var.scope, c.req.valid("param").id)),
    )
    .get(
      "/turns/:id",
      v("param", workParams),
      v("query", workReadInput),
      scopes.workspace("query"),
      async (c) => respond(c, await work.turn(c.var.scope, c.req.valid("param").id)),
    )
    .post(...command("/turns/:id/stop"), async (c) =>
      respond(c, await work.turnCommand(c.var.scope, "stopTurn", c.req.valid("param").id)),
    )
    .post(...command("/turns/:id/retry"), async (c) =>
      respond(c, await work.turnCommand(c.var.scope, "retryTurn", c.req.valid("param").id)),
    )
    .post(...command("/turns/:id/dismiss"), async (c) =>
      respond(c, await work.turnCommand(c.var.scope, "dismissTurn", c.req.valid("param").id)),
    )
    .post(...command("/turns/:id/start-fresh"), async (c) =>
      respond(c, await work.turnCommand(c.var.scope, "startFresh", c.req.valid("param").id)),
    )
    .post(...command("/items/:id/send-now"), async (c) =>
      respond(c, await work.itemCommand(c.var.scope, "sendNow", c.req.valid("param").id)),
    )
    .post(...command("/items/:id/resend"), async (c) =>
      respond(c, await work.itemCommand(c.var.scope, "resendItem", c.req.valid("param").id)),
    )
    .post(...command("/items/:id/discard"), async (c) =>
      respond(c, await work.itemCommand(c.var.scope, "discardItem", c.req.valid("param").id)),
    )
    .post(...command("/conversations/:id/new-topic"), async (c) =>
      respond(c, await work.newTopic(c.var.scope, c.req.valid("param").id)),
    )
    .post("/routines", v("json", ownerCreateRoutineInput), scopes.workspace("json"), async (c) =>
      respond(c, await work.createRoutine(c.var.scope, c.req.valid("json"))),
    )
    .patch(
      "/routines/:id",
      v("param", routineParams),
      v("json", ownerUpdateRoutineInput),
      scopes.workspace("json"),
      async (c) =>
        respond(
          c,
          await work.updateRoutine(c.var.scope, c.req.valid("param").id, c.req.valid("json")),
        ),
    )
    .delete(
      "/routines/:id",
      v("param", routineParams),
      v("query", ownerDeleteRoutineInput),
      scopes.workspace("query"),
      async (c) => respond(c, await work.deleteRoutine(c.var.scope, c.req.valid("param").id)),
    )
    .post(
      "/routines/:id/approve",
      v("param", routineParams),
      v("json", approveRoutineInput),
      scopes.workspace("json"),
      async (c) =>
        respond(
          c,
          await work.approveRoutine(
            c.var.scope,
            c.req.valid("param").id,
            c.req.valid("json").revision,
          ),
        ),
    );
}
