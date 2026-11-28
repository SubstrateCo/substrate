import type { AgentConfiguration } from "@substrate/contracts/agents";

import { AgentAppearanceView } from "./agent-appearance-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useAgentAvatarMutation } from "@/queries/agents/mutations";

export function AgentAppearance({ agent }: { agent: AgentConfiguration }) {
  const { userId } = useWorkspaceScope();
  const save = useAgentAvatarMutation(userId);
  return (
    <AgentAppearanceView
      name={agent.name}
      avatar={agent.avatar}
      error={save.variables?.id === agent.id ? save.error : null}
      onChange={(avatar) => save.mutate({ id: agent.id, avatar })}
    />
  );
}
