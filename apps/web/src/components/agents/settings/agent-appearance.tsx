import type { AgentConfiguration } from "@substrate/contracts/agents";

import { AgentAppearanceView } from "./agent-appearance-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useAgentAvatarMutation } from "@/queries/agents/mutations";

/** The agent's shape and colour. The catalog shows a choice while it saves. */
export function AgentAppearance({ agent }: { agent: AgentConfiguration }) {
  const { userId } = useWorkspaceScope();
  const save = useAgentAvatarMutation(userId);
  return (
    <AgentAppearanceView
      name={agent.name}
      avatar={agent.avatar}
      // The mutation outlives each agent's page; show only this agent's failure.
      error={save.variables?.id === agent.id ? save.error : null}
      onChange={(avatar) => save.mutate({ id: agent.id, avatar })}
    />
  );
}
