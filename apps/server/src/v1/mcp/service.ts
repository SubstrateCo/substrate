import type { mcpCall } from "@substrate/contracts/harness/tools";
import { executeAgentTool } from "@substrate/database/mcp";
import { ensureUserAgentActor, type Database } from "@substrate/database/trusted";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { z } from "zod";

export function createMcpService({ db, publish }: { db: Database; publish: CommittedPublisher }) {
  return {
    callAgentTool(scope: WorkspaceScope, call: z.output<typeof mcpCall>) {
      return serviceResult(async () => {
        const { organizationId, userId } = scope;
        const actor = await ensureUserAgentActor(db, {
          organizationId,
          userId,
          userAgentId: call.agentId,
        });
        // The database verifies TurnContext, and requires the home installation for write tools.
        const execution = await publish(
          await executeAgentTool(
            db,
            { organizationId, userId, actorEntityId: actor.entityId },
            call.tool,
            call.input,
            call.turn,
          ),
        );
        return execution.output;
      });
    },
  };
}
export type McpService = ReturnType<typeof createMcpService>;
