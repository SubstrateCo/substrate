import type { NewOutput } from "@substrate/client-storage/agent-work";
import { proposeResult, replyResult, taskResult } from "@substrate/contracts/harness/tools";

/* oxlint-disable deslop/no-unknown-parameters -- MCP results are untyped JSON from the server; they are parsed here. */
import { z } from "zod";

const call = z.object({ tool: z.string(), turn: z.object({ turnId: z.string().min(1) }) });
const success = z.object({ success: z.literal(true), data: z.unknown() });

/**
 * The records an MCP call published or created, from its request body and result. Main sees
 * every server tool call on its way to /api/v1/mcp/call; this turns the ones that publish into
 * turn outputs. Results are parsed with the tools' shared output schemas; other shapes produce
 * nothing.
 */
export function toolOutputs(
  request: unknown,
  result: unknown,
): { turnId: string; outputs: NewOutput[] } | null {
  const parsedCall = call.safeParse(request);
  const parsedResult = success.safeParse(result);
  if (!parsedCall.success || !parsedResult.success) return null;
  const { tool, turn } = parsedCall.data;
  const data = parsedResult.data.data;
  const outputs: NewOutput[] = [];
  if (tool === "reply") {
    const value = replyResult.safeParse(data);
    if (!value.success) return null;
    outputs.push({
      kind: "message",
      id: value.data.messageId,
      conversationId: value.data.conversationId,
      threadId: value.data.threadId,
    });
    if (value.data.questionId)
      outputs.push({ kind: "request", id: value.data.questionId, requestKind: "question" });
  } else if (tool === "propose") {
    const value = proposeResult.safeParse(data);
    if (value.success)
      outputs.push({ kind: "request", id: value.data.proposalId, requestKind: "proposal" });
  } else if (tool === "create_task" || tool === "update_task") {
    const value = taskResult.safeParse(data);
    if (value.success) outputs.push({ kind: "task", id: value.data.id });
  }
  return outputs.length ? { turnId: turn.turnId, outputs } : null;
}
