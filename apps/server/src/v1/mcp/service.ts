import type { mcpCall } from "@substrate/contracts/harness/tools";
import { executeAgentTool } from "@substrate/database/mcp";
import { ensureUserAgentActor } from "@substrate/database/trusted";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { publishCommitted } from "../realtime/committed";
import type { z } from "zod";

// The route validates the call envelope, including the turn context the desktop host attached.
// executeAgentTool checks that the turn belongs to this agent and validates input and output.
export function callAgentTool(headers: Headers, call: z.output<typeof mcpCall>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { session, organizationId } = await workspaceSession(headers, call.organizationId);
    const actor = await ensureUserAgentActor(db, {
      organizationId,
      userId: session.user.id,
      userAgentId: call.agentId,
    });
    const execution = await publishCommitted(
      await executeAgentTool(
        db,
        { organizationId, userId: session.user.id, actorEntityId: actor.entityId },
        call.tool,
        call.input,
        call.turn,
      ),
    );
    return execution.output;
  });
}
