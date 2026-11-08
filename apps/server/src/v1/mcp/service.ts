import { mcpCall, mcpTools } from "@startup-os/contracts/harness/tools";
import { realtimeKeys, type RealtimeHint } from "@startup-os/contracts/realtime";
import { executeAgentTool } from "@startup-os/database/mcp";
import { ensureUserAgentActor } from "@startup-os/database/provisioning";
import { messageRefreshHints } from "@startup-os/database/realtime";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { publishRefresh } from "../realtime/publisher";
import type { z } from "zod";

export function callAgentTool(headers: Headers, raw: z.input<typeof mcpCall>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const call = mcpCall.parse(raw);
    const { session, organizationId } = await workspaceSession(headers, call.organizationId);
    const actor = await ensureUserAgentActor(db, {
      organizationId,
      userId: session.user.id,
      userAgentId: call.agentId,
    });
    const result = await executeAgentTool(
      db,
      { organizationId, userId: session.user.id, actorEntityId: actor.entityId },
      call.tool,
      call.input,
    );
    if (!mcpTools[call.tool].readOnly) {
      const audience = realtimeKeys.organization(organizationId);
      const hints: RealtimeHint[] = [
        { audience, domain: "tasks" },
        { audience, domain: "context" },
      ];
      if (call.tool === "send_message")
        hints.push(
          ...(await messageRefreshHints(db, mcpTools.send_message.output.parse(result).messageId)),
        );
      let assignee;
      if (call.tool === "create_task")
        assignee = mcpTools.create_task.input.parse(call.input).assigneeActorId;
      if (call.tool === "update_task")
        assignee = mcpTools.update_task.input.parse(call.input).changes.assigneeActorId;
      if (assignee)
        hints.push({
          audience: realtimeKeys.actor(organizationId, assignee),
          domain: "notifications",
        });
      await publishRefresh(hints);
    }
    return result;
  });
}
