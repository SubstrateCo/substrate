import type { HarnessKind } from "@substrate/contracts/harness-runtime";

import type { AgentModelField } from "./agent-form";
import { StartupInstructions } from "./startup-instructions";
import { HarnessAvailability } from "@/components/agents/model-picker/harness-availability";
import { ModelPicker } from "@/components/agents/model-picker/model-picker";
import { HarnessAccount } from "@/components/agents/sign-in/harness-account";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";

export function useAgentFieldRenderers(agentId?: string) {
  const { userId, organizationId } = useWorkspaceScope();
  const renderModel = ({ id, harness, model, disabled, onChange }: AgentModelField) => (
    <HarnessAccount agentId={agentId} harness={harness}>
      {(signIn) => (
        <>
          <ModelPicker
            key={`${userId}/${organizationId}`}
            id={id}
            agentId={agentId}
            harness={harness}
            model={model}
            disabled={disabled}
            onSignIn={signIn}
            onChange={onChange}
          />
          <HarnessAvailability harness={harness} />
        </>
      )}
    </HarnessAccount>
  );
  const renderStartupInstructions = ({ harness, name }: { harness: HarnessKind; name: string }) => (
    <StartupInstructions harness={harness} name={name} agentId={agentId} />
  );
  return { renderModel, renderStartupInstructions };
}
