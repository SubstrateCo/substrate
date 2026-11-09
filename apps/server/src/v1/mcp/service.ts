import { type mcpCall, mcpTools } from "@startup-os/contracts/harness/tools";
import { realtimeKeys, type RealtimeHint } from "@startup-os/contracts/realtime";
import { executeAgentTool } from "@startup-os/database/mcp";
import { ensureUserAgentActor } from "@startup-os/database/provisioning";
import { messageRefreshHints } from "@startup-os/database/realtime";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { publishRefresh } from "../realtime/publisher";
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
    const execution = await executeAgentTool(
      db,
      { organizationId, userId: session.user.id, actorEntityId: actor.entityId },
      call.tool,
      call.input,
      call.turn,
    );
    if (!mcpTools[execution.tool].readOnly) {
      const audience = realtimeKeys.organization(organizationId);
      const hints: RealtimeHint[] = [
        { audience, domain: "tasks" },
        { audience, domain: "context" },
      ];
      if (execution.tool === "reply")
        hints.push(...(await messageRefreshHints(db, execution.output.messageId)));
      // Replies, questions and proposals change what the owner's agent-work views show.
      if (execution.tool === "reply" || execution.tool === "propose")
        hints.push({ audience: realtimeKeys.user(session.user.id), domain: "agent-work" });
      let assignee;
      if (execution.tool === "create_task") assignee = execution.input.assigneeActorId;
      if (execution.tool === "update_task") assignee = execution.input.changes.assigneeActorId;
      if (assignee)
        hints.push({
          audience: realtimeKeys.actor(organizationId, assignee),
          domain: "notifications",
        });
      await publishRefresh(hints);
    }
    return execution.output;
  });
}
