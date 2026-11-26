import { approvalPendingCode } from "@substrate/contracts/agent-work";
import type { mcpCall } from "@substrate/contracts/harness/tools";
import type { ServiceResult } from "@substrate/contracts/result";
import { approvalPendingMessage } from "@substrate/database/mcp";
import { ensureUserAgentActor, type Database } from "@substrate/database/trusted";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";
import { executeAgentTool } from "./execution";
import type { z } from "zod";

/** A call stored as a proposal. The agent learns the result in a later turn. */
export type ApprovalPending = {
  success: false;
  error: { code: typeof approvalPendingCode; message: string; requestId: string };
};

export function createMcpService({ db, publish }: { db: Database; publish: CommittedPublisher }) {
  return {
    async callAgentTool(
      scope: WorkspaceScope,
      call: z.output<typeof mcpCall>,
    ): Promise<ServiceResult<unknown> | { pending: ApprovalPending }> {
      const result = await serviceResult(async () => {
        const { organizationId, userId } = scope;
        const actor = await ensureUserAgentActor(db, {
          organizationId,
          userId,
          userAgentId: call.agentId,
        });
        // The database verifies TurnContext, and requires the home installation for write tools.
        return publish(
          await executeAgentTool(
            db,
            { organizationId, userId, actorEntityId: actor.entityId },
            call.tool,
            call.input,
            call.turn,
          ),
        );
      });
      if (!result.success) return result;
      const execution = result.data;
      if ("pending" in execution)
        return {
          pending: {
            success: false,
            error: {
              code: approvalPendingCode,
              message: approvalPendingMessage,
              requestId: execution.pending.requestId,
            },
          },
        };
      return { success: true, data: execution.output };
    },
  };
}
export type McpService = ReturnType<typeof createMcpService>;
