import type {
  AgentCatalog as AgentCatalogData,
  AgentConfiguration,
  SaveAgentInput,
  SaveSkillInput,
} from "@startup-os/contracts/agents";
import type { HarnessKind, HarnessSkill } from "@startup-os/contracts/harness";

import { useState, type ReactNode } from "react";

import { AgentEditor } from "./agent-editor";
import { AgentCatalog } from "./agent-settings/agent-catalog";
import { DeleteDefinitionDialog } from "./agent-settings/delete-definition-dialog";
import { DeviceConfiguration } from "./agent-settings/device-configuration";
import { CatalogSection } from "./catalog-section";
import { CatalogRow } from "./catalog-section/catalog-row";
import { SkillEditor } from "./skill-editor";
import { Button } from "@/components/ui/button";

export type CatalogKind = "agent" | "skill";
type Editor = { kind: CatalogKind; id?: string };

export function AgentSettingsView({
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
  onDelete,
}: {
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
        <p className="text-sm text-muted-foreground">
          Your personal agent definitions are shared across your workspaces, not owned by an
          organization. Agents execute locally through installed harnesses under the selected
          organization directory. No arbitrary working directory picker is available.
        </p>
      </div>
      <aside aria-label="Startup OS defaults" className="rounded-xl border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Built-in Startup OS defaults</p>
        <p>
          The bundled Startup OS skill and embedded MCP server (hello_world only) are assigned to
          new agents by default. These are built-in, not custom definitions, and grant no app-data
          permissions.
        </p>
        <p className="mt-2 text-muted-foreground">
          Saving updates your configuration. Local execution requires the desktop harness
          integration and an installed, signed-in harness.
        </p>
      </aside>
      {loading && <p role="status">Loading agent settings…</p>}
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
            description="Reusable instructions stored in native files on this device."
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
              agent={editedAgent}
              picture={editedAgent && renderAgentPicture(editedAgent)}
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
