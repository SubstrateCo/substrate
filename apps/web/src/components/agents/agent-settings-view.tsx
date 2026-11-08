import type {
  AgentCatalog as AgentCatalogData,
  AgentConfiguration,
  AgentRunSettings,
  SaveAgentInput,
} from "@startup-os/contracts/agents";
import type { HarnessKind } from "@startup-os/contracts/harness";

import { useState, type ReactNode } from "react";

import { AgentCatalog } from "./catalog/agent-catalog";
import { DeleteDefinitionDialog } from "./catalog/delete-definition-dialog";
import { AgentEditor, type AgentSection } from "./editors/agent-editor";
import { Button } from "@/components/ui/button";

type Editor = { id?: string };

export function AgentSettingsView({
  userId,
  organizationId,
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
  catalog?: AgentCatalogData;
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
  renderRunSettings: (
    agent: AgentConfiguration,
    settings: AgentRunSettings,
    onClose: () => void,
  ) => ReactNode;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editor, setEditor] = useState<Editor>();
  const [runSettingsFor, setRunSettingsFor] = useState<string>();
  const runAgent = catalog?.agents.find((agent) => agent.id === runSettingsFor);
  const runSettings = catalog?.runSettings.find((item) => item.agentId === runSettingsFor);
  const [deleting, setDeleting] = useState<{ id: string; name: string }>();
  const close = () => setEditor(undefined);
  const editedAgent = catalog?.agents.find((agent) => agent.id === editor?.id);
  return (
    <section aria-labelledby="agents-title" className="grid gap-5">
      <div>
        <h2 id="agents-title" className="text-lg font-semibold">
          Agents
        </h2>
      </div>
      {error && (
        <div role="alert">
          <p>{error.message}</p>
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {(catalog || loading) && (
        <AgentCatalog
          agents={catalog?.agents}
          runSettings={catalog?.runSettings}
          loading={loading}
          pending={pending}
          onCreate={() => setEditor({})}
          onRunSettings={(agent) => setRunSettingsFor(agent.id)}
          onEdit={(agent) => setEditor({ id: agent.id })}
          onDelete={(agent) => setDeleting({ id: agent.id, name: agent.name })}
        />
      )}
      {catalog && editor && (
        <AgentEditor
          userId={userId}
          organizationId={organizationId}
          agent={editedAgent}
          picture={editedAgent && renderAgentPicture(editedAgent)}
          renderConfiguration={renderAgentConfiguration}
          pending={pending}
          onClose={close}
          onSave={async (input) => {
            await onSaveAgent(input);
            close();
          }}
        />
      )}
      {runAgent &&
        runSettings &&
        renderRunSettings(runAgent, runSettings, () => setRunSettingsFor(undefined))}
      {deleting && (
        <DeleteDefinitionDialog
          name={deleting.name}
          pending={pending}
          onClose={() => setDeleting(undefined)}
          onDelete={() => onDelete(deleting.id)}
        />
      )}
    </section>
  );
}
