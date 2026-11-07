import {
  agentAccessChange,
  agentAccessScope,
  type AgentAccessChange,
} from "@startup-os/contracts/agents";
import { agentAccessRepository } from "@startup-os/database/agents";
import { ensureHumanActor } from "@startup-os/database/provisioning";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";

async function repository(headers: Headers, organizationId: string) {
  const { session } = await workspaceSession(headers, organizationId);
  const actor = await ensureHumanActor(db, {
    organizationId,
    userId: session.user.id,
    name: session.user.name,
  });
  return agentAccessRepository(db, session.user.id, {
    organizationId,
    actorEntityId: actor.entityId,
  });
}

export function listAgentAccess(
  headers: Headers,
  raw: { organizationId: string; agentId: string },
) {
  return serviceResult(async () => {
    const input = agentAccessScope.parse(raw);
    return (await repository(headers, input.organizationId)).list(input.agentId);
  });
}

export function changeAgentAccess(headers: Headers, raw: AgentAccessChange) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = agentAccessChange.parse(raw);
    return (await repository(headers, input.organizationId)).change(input);
  });
}
