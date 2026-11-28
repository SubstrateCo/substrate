import type { WorkspaceApiRequest, WorkspaceApiResult } from "@substrate/contracts/agent-tools/mcp";
import { mcpTools, type ToolDefinition } from "@substrate/contracts/agent-tools/tools";
import { approvalPendingCode } from "@substrate/contracts/agent-work";

import type { TurnOutput } from "../runtime/context.ts";
import { z } from "zod";

const fields = z.record(z.string(), z.unknown());

export function toolOutputs(
  request: WorkspaceApiRequest,
  result: WorkspaceApiResult,
): { turnId: string; outputs: TurnOutput[] } | null {
  if (!result.success) {
    const { code, requestId } = result.error;
    if (code !== approvalPendingCode || !requestId) return null;
    return {
      turnId: request.turn.turnId,
      outputs: [{ kind: "request", id: requestId, requestKind: "proposal" }],
    };
  }
  const definition: ToolDefinition = mcpTools[request.tool];
  if (!definition.publishes) return null;
  const parsed = definition.output.safeParse(result.data);
  if (!parsed.success) return null;
  const data = fields.parse(parsed.data);
  const outputs: TurnOutput[] = [];
  for (const publication of definition.publishes) {
    const id = z.string().safeParse(data[publication.id]);
    if (!id.success) continue;
    if (publication.kind === "message") {
      outputs.push({
        kind: "message",
        id: id.data,
        conversationId: z.string().parse(data[publication.conversationId]),
        threadId: z.string().nullable().parse(data[publication.threadId]),
      });
    } else if (publication.kind === "request") {
      outputs.push({ kind: "request", id: id.data, requestKind: publication.requestKind });
    } else {
      outputs.push({ kind: "task", id: id.data });
    }
  }
  return outputs.length ? { turnId: request.turn.turnId, outputs } : null;
}
