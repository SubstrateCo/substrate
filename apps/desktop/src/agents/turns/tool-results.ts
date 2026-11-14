import type { NewOutput } from "@substrate/client-storage/agent-work";
import type { WorkspaceApiRequest, WorkspaceApiResult } from "@substrate/contracts/harness/mcp";
import { mcpTools, type ToolDefinition } from "@substrate/contracts/harness/tools";

import { z } from "zod";

const fields = z.record(z.string(), z.unknown());

/** The registry declares which output fields identify published records. */
export function toolOutputs(
  request: WorkspaceApiRequest,
  result: WorkspaceApiResult,
): { turnId: string; outputs: NewOutput[] } | null {
  if (!result.success) return null;
  const definition: ToolDefinition = mcpTools[request.tool];
  if (!definition.publishes) return null;
  const parsed = definition.output.safeParse(result.data);
  if (!parsed.success) return null;
  const data = fields.parse(parsed.data);
  const outputs: NewOutput[] = [];
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
