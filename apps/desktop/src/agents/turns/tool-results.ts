/* oxlint-disable deslop/no-unknown-parameters -- MCP input and result payloads are parsed here before output extraction. */
import type { NewOutput } from "@substrate/client-storage/agent-work";
import { mcpTools, type ToolDefinition } from "@substrate/contracts/harness/tools";

import { z } from "zod";

const call = z.object({ tool: z.string(), turn: z.object({ turnId: z.string().min(1) }) });
const success = z.object({ success: z.literal(true), data: z.unknown() });
const fields = z.record(z.string(), z.unknown());

/** The registry declares which output fields identify published records. */
export function toolOutputs(
  request: unknown,
  result: unknown,
): { turnId: string; outputs: NewOutput[] } | null {
  const parsedCall = call.safeParse(request);
  const parsedResult = success.safeParse(result);
  if (!parsedCall.success || !parsedResult.success) return null;
  const { tool, turn } = parsedCall.data;
  if (!Object.hasOwn(mcpTools, tool)) return null;
  // SAFETY: own-key membership was checked against the tool registry.
  const definition: ToolDefinition = mcpTools[tool as keyof typeof mcpTools];
  if (!definition.publishes) return null;
  const parsed = definition.output.safeParse(parsedResult.data.data);
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
  return outputs.length ? { turnId: turn.turnId, outputs } : null;
}
