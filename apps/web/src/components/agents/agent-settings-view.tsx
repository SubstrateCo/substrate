import type {
  AgentCatalog as AgentCatalogData,
  AgentConfiguration,
  SaveAgentInput,
  SaveSkillInput,
} from "@startup-os/contracts/agents";
import type { HarnessKind, HarnessSkill } from "@startup-os/contracts/harness";

import { useState, type ReactNode } from "react";

import { AgentCatalog } from "./catalog/agent-catalog";
import { CatalogRow } from "./catalog/catalog-row";
import { CatalogSection } from "./catalog/catalog-section";
import { DeleteDefinitionDialog } from "./catalog/delete-definition-dialog";
import { DeviceConfiguration } from "./device/device-configuration";
import { AgentEditor, type AgentSection } from "./editors/agent-editor";
import { SkillEditor } from "./editors/skill-editor";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";

export type CatalogKind = "agent" | "skill";
type Editor = { kind: CatalogKind; id?: string };

export function AgentSettingsView({
  userId,
  organizationId,
  catalog,
  localConfiguration,
  localAvailable,
  localLoading,
  localError,
  localHarness,
  onLocalHarnessChange,
  onScan,
  loading,
  error,
  pending,
  onRetry,
  onSaveAgent,
  onSaveSkill,
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
  localConfiguration?: { skills: HarnessSkill[] };
  localAvailable: boolean;
  localLoading: boolean;
  localError: Error | null;
  localHarness: HarnessKind;
  onLocalHarnessChange: (harness: HarnessKind) => void;
  onScan: () => void;
  onSaveAgent: (input: SaveAgentInput) => Promise<void>;
  onSaveSkill: (input: SaveSkillInput) => Promise<void>;
  renderAgentPicture: (agent: AgentConfiguration) => ReactNode;
  renderAgentConfiguration: (
    harness: HarnessKind,
    section: AgentSection,
    defaults: boolean,
  ) => ReactNode;
  onDelete: (kind: CatalogKind, id: string) => Promise<void>;
}) {
  const [editor, setEditor] = useState<Editor>();
  const [deleting, setDeleting] = useState<{ kind: CatalogKind; id: string; name: string }>();
  const close = () => setEditor(undefined);
  const skills = localAvailable ? (localConfiguration?.skills ?? []) : [];
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
            onCreate={() => setEditor({ kind: "agent" })}
            onEdit={(agent) => setEditor({ kind: "agent", id: agent.id })}
            onDelete={(agent) => setDeleting({ kind: "agent", id: agent.id, name: agent.name })}
          />
          <DeviceConfiguration
            available={localAvailable}
            loading={localLoading}
            error={localError}
            harness={localHarness}
            pending={pending}
            onHarnessChange={onLocalHarnessChange}
            onScan={onScan}
          />
          <CatalogSection
            title="Custom skills"
            label="Skills"
            addLabel="Create skill"
            disabled={!localAvailable || pending || localLoading}
            onAdd={() => setEditor({ kind: "skill" })}
            empty={!skills.length}
          >
            {skills.map((skill) => (
              <CatalogRow
                key={skill.id}
                name={skill.name}
                detail={skill.description}
                disabled={pending}
                onEdit={() => setEditor({ kind: "skill", id: skill.id })}
                onDelete={() => {
                  setDeleting({ kind: "skill", id: skill.id, name: skill.name });
                }}
              />
            ))}
          </CatalogSection>
          {editor?.kind === "agent" && (
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
          {editor?.kind === "skill" && localAvailable && (
            <SkillEditor
              skill={skills.find((skill) => skill.id === editor.id)}
              pending={pending}
              onClose={close}
              onSave={async (input) => {
                await onSaveSkill(input);
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
          onDelete={() => onDelete(deleting.kind, deleting.id)}
        />
      )}
    </section>
  );
}
