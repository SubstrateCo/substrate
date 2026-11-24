import * as input from "@substrate/contracts/meetings/input";
import { publicFailure } from "@substrate/contracts/result";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { MeetingService } from "./service";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

export function createMeetingRoutes(service: MeetingService, scopes: Scopes) {
  const query = scopes.workspace("query"),
    json = scopes.workspace("json"),
    record = v("param", input.recordId);
  const scope = v("query", input.workspace),
    dated = v("query", input.datedWorkspace);
  return new Hono<ScopeEnv>()
    .post("/records", v("json", input.createMeeting), json, async (c) => {
      const { meeting, requestId } = c.req.valid("json");
      return respond(c, await service.create(c.var.scope, meeting, requestId));
    })
    .post("/list", v("json", input.archiveList), json, async (c) =>
      respond(c, await service.list(c.var.scope, c.req.valid("json").query)),
    )
    .post("/calendar", v("json", input.archiveCalendar), json, async (c) =>
      respond(c, await service.calendar(c.var.scope, c.req.valid("json").query)),
    )
    .get("/records/:id", record, dated, query, async (c) =>
      respond(
        c,
        await service.detail(c.var.scope, c.req.valid("param").id, c.req.valid("query").timeZone),
      ),
    )
    .get("/originals/:id", record, scope, query, async (c) =>
      respond(c, await service.original(c.var.scope, c.req.valid("param").id)),
    )
    .get("/reviews", dated, query, async (c) =>
      respond(c, await service.reviews(c.var.scope, c.req.valid("query").timeZone)),
    )
    .post("/reviews/:id", record, v("json", input.reviewDecision), json, async (c) => {
      const { candidateId, combine } = c.req.valid("json");
      return respond(
        c,
        await service.decide(c.var.scope, c.req.valid("param").id, candidateId, combine),
      );
    })
    .get("/sources", scope, query, async (c) => respond(c, await service.sources(c.var.scope)))
    .post(
      "/import",
      scope,
      query,
      bodyLimit({
        maxSize: 2 * input.hexFileLimit + 4096,
        onError: (c) =>
          respond(
            c,
            publicFailure("PAYLOAD_TOO_LARGE", "The meeting import exceeds the size limit."),
          ),
      }),
      v("json", input.importMarkdown),
      async (c) => respond(c, await service.importHex(c.var.scope, c.req.valid("json").raw)),
    );
}
