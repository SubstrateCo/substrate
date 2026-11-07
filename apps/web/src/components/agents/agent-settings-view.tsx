import type {
  AgentCatalog as AgentCatalogData,
  AgentConfiguration,
  SaveAgentInput,
} from "@startup-os/contracts/agents";
import type { HarnessKind } from "@startup-os/contracts/harness";

import { useState, type ReactNode } from "react";

import { AgentCatalog } from "./catalog/agent-catalog";
import { DeleteDefinitionDialog } from "./catalog/delete-definition-dialog";
import { AgentEditor, type AgentSection } from "./editors/agent-editor";
import { LoadingState } from "@/components/feedback/loading-state";
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
  ) => ReactNode;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editor, setEditor] = useState<Editor>();
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
      {loading && <LoadingState label="Loading agent settings" />}
      {error && (
        <div role="alert">
          <p>{error.message}</p>
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {catalog && (
        <>
          <AgentCatalog
            agents={catalog.agents}
            pending={pending}
            onCreate={() => setEditor({})}
            onEdit={(agent) => setEditor({ id: agent.id })}
            onDelete={(agent) => setDeleting({ id: agent.id, name: agent.name })}
          />
          {editor && (
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
        </>
      )}
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
