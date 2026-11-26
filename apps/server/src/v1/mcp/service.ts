import type { mcpCall } from "@substrate/contracts/agent-tools/tools";
import { approvalPendingCode } from "@substrate/contracts/agent-work";
import type { ServiceResult } from "@substrate/contracts/result";
import { approvalPendingMessage, executeUserAgentTool } from "@substrate/database/mcp";
import type { Database } from "@substrate/database/trusted";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";
import type { ObjectStorage } from "../../storage/types";
import { storageFileReader } from "../files/agent-file-reader";
import type { ImageCodec } from "../files/image-codec";
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
  images,
}: {
  db: Database;
  publish: CommittedPublisher;
  storage: ObjectStorage;
  images: ImageCodec;
}) {
  const reader = storageFileReader(storage, images);
  return {
    async callAgentTool(
      scope: WorkspaceScope,
      call: z.output<typeof mcpCall>,
    ): Promise<ServiceResult<unknown> | { pending: ApprovalPending }> {
      const result = await serviceResult(async () => {
        const { organizationId, userId, installationId } = scope;
        // The database loads the server turn that TurnContext names. It must be live and leased by
        // the agent's home device, which must be the installation this request came from.
        return publish(
          await executeUserAgentTool(
            db,
            { organizationId, userId, userAgentId: call.agentId, installationId },
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
