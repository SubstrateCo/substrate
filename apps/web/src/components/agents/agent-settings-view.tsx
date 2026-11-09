import type {
  AgentCatalog,
  AgentConfiguration,
  AgentRunSettings,
  SaveAgentInput,
} from "@startup-os/contracts/agents";
import type { HarnessKind } from "@startup-os/contracts/harness";

import { useState, type ReactNode } from "react";

import { DeleteDefinitionDialog } from "./catalog/delete-definition-dialog";
import { AgentEditor } from "./editors/agent-editor";
import { AgentForm, type AgentSection } from "./editors/agent-form";
import { SettingsCard } from "./layout/settings-section";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";

export function AgentSettingsView({
  userId,
  organizationId,
  agentId,
  onClose,
  catalog,
  loading,
  error,
  pending,
  onRetry,
  onSaveAgent,
  renderAgentPicture,
  renderAgentConfiguration,
  renderRunSettings,
  onDelete,
}: {
  userId: string;
  organizationId?: string | null;
  agentId?: string;
  onClose: () => void;
  catalog?: AgentCatalog;
  loading: boolean;
  error: Error | null;
  pending: boolean;
  onRetry: () => void;
  onSaveAgent: (input: SaveAgentInput) => Promise<void>;
  renderAgentPicture: (agent: AgentConfiguration) => ReactNode;
  renderAgentConfiguration: (
    harness: HarnessKind,
    section: AgentSection,
    defaults: boolean,
    agentId?: string,
  ) => ReactNode;
  renderRunSettings: (agent: AgentConfiguration, settings: AgentRunSettings) => ReactNode;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const agent = catalog?.agents.find((item) => item.id === agentId);
  const runSettings = catalog?.runSettings.find((item) => item.agentId === agentId);
  return (
    <section aria-label="Agent settings" className="grid gap-8">
      {error && (
        <div role="alert">
          <p>{error.message}</p>
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {agentId && loading && <LoadingState label="Loading agent settings" variant="compact" />}
      {agent && (
        <AgentForm
          userId={userId}
          organizationId={organizationId}
          agent={agent}
          picture={renderAgentPicture(agent)}
          renderConfiguration={renderAgentConfiguration}
          pending={pending}
          onSave={onSaveAgent}
          runSettings={runSettings && renderRunSettings(agent, runSettings)}
          deleteAction={
            <SettingsCard label="Delete agent" tone="destructive" className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-medium">Delete agent</p>
                  <p className="text-sm text-muted-foreground">
                    Conversation history is kept when you delete this agent.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  aria-label={`Delete ${agent.name}`}
                  onClick={() => setDeleting(true)}
                >
                  Delete agent
                </Button>
              </div>
            </SettingsCard>
          }
        />
      )}
      {!agentId && (
        <AgentEditor
          userId={userId}
          organizationId={organizationId}
          renderConfiguration={renderAgentConfiguration}
          pending={pending}
          onClose={onClose}
          onSave={async (input) => {
            await onSaveAgent(input);
            onClose();
          }}
        />
      )}
      {agent && deleting && (
        <DeleteDefinitionDialog
          name={agent.name}
          pending={pending}
          onClose={() => setDeleting(false)}
          onDelete={() => onDelete(agent.id)}
        />
      )}
    </section>
  );
}
