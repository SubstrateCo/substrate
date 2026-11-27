import type {
  AgentConfiguration,
  AgentRunSettings as RunSettings,
} from "@substrate/contracts/agents";

import { ToolsSummary } from "./tools-summary";
import { Routines } from "@/components/agent-work/routines/routines";
import { AgentForm } from "@/components/agents/editors/agent-form";
import { AgentPicture } from "@/components/agents/editors/agent-picture";
import { useAgentFieldRenderers } from "@/components/agents/editors/use-agent-field-renderers";
import { AgentRunSettings } from "@/components/agents/run-settings/agent-run-settings";
import { DangerZoneCard } from "@/components/feedback/danger-zone-card";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useAgentMutations } from "@/queries/agents/mutations";
import { toast } from "sonner";

/**
 * Every setting of one agent on one scrolling page: its details, when it runs, a summary of its
 * routines and tools, and delete. Only the details card holds a draft; everything else saves at
 * once or opens its own list.
 */
export function AgentSettingsOverview({
  agent,
  runSettings,
  onOpenPage,
  onDeleted,
}: {
  agent: AgentConfiguration;
  runSettings?: RunSettings;
  onOpenPage: (page: "routines" | "skills" | "mcps") => void;
  onDeleted: () => void;
}) {
  const { userId } = useWorkspaceScope();
  const { save, remove } = useAgentMutations(userId);
  const renderers = useAgentFieldRenderers(agent.id);
  const pending = save.isPending || remove.isPending;
  return (
    <div className="grid min-w-0 gap-6">
      <AgentForm
        key={agent.id}
        {...renderers}
        agent={agent}
        picture={<AgentPicture agentId={agent.id} name={agent.name} image={agent.image} />}
        pending={pending}
        // The mutation outlives each agent's form; show only this agent's failure.
        error={save.variables?.id === agent.id ? save.error : null}
        onResetError={() => save.reset()}
        onSave={(input, options) => save.mutate(input, { onSuccess: options.onSuccess })}
      />
      {runSettings && <AgentRunSettings key={agent.id} agent={agent} settings={runSettings} />}
      <Routines agentId={agent.id} name={agent.name} onShowAll={() => onOpenPage("routines")} />
      <ToolsSummary
        agent={agent}
        homeDevice={runSettings?.homeDevice ?? null}
        onOpen={onOpenPage}
      />
      <DangerZoneCard
        title="Delete agent"
        actionLabel={`Delete ${agent.name}`}
        description={`Removes ${agent.name} and its settings. Messages it posted stay.`}
        confirmTitle={`Delete ${agent.name}?`}
        confirmDescription={`This removes ${agent.name} and its settings. Messages it already posted stay in their conversations. You can’t undo this.`}
        pending={pending}
        error={remove.error}
        errorDescription="We couldn’t delete this agent. Try again."
        onReset={() => remove.reset()}
        onConfirm={(closeConfirm) =>
          remove.mutate(agent.id, {
            onSuccess: () => {
              toast.success("Agent deleted.");
              closeConfirm();
              onDeleted();
            },
          })
        }
      />
    </div>
  );
}
