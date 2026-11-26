import { approvalPendingCode } from "@substrate/contracts/agent-work";
import type { mcpCall } from "@substrate/contracts/harness/tools";
import type { ServiceResult } from "@substrate/contracts/result";
import { approvalPendingMessage, executeUserAgentTool } from "@substrate/database/mcp";
import type { Database } from "@substrate/database/trusted";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";
import type { ObjectStorage } from "../../storage/types";
import { storageFileReader } from "../files/agent-file-reader";
import type { z } from "zod";

/** A call stored as a proposal. The agent learns the result in a later turn. */
export type ApprovalPending = {
  success: false;
  error: { code: typeof approvalPendingCode; message: string; requestId: string };
};

export function createMcpService({
  db,
  publish,
  storage,
}: {
  db: Database;
  publish: CommittedPublisher;
  storage: ObjectStorage;
}) {
  const reader = storageFileReader(storage);
  return {
    async callAgentTool(
      scope: WorkspaceScope,
      call: z.output<typeof mcpCall>,
    ): Promise<ServiceResult<unknown> | { pending: ApprovalPending }> {
      const result = await serviceResult(async () => {
        const { organizationId, userId } = scope;
        // The database verifies TurnContext, and requires the home installation for write tools.
        return publish(
          await executeUserAgentTool(
            db,
            { organizationId, userId, userAgentId: call.agentId },
            call.tool,
            call.input,
            call.turn,
            reader,
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
