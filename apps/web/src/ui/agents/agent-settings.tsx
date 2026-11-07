import type {
  AgentCatalog,
  AgentConfiguration,
  SaveAgentInput,
  SaveSkillInput,
} from "@startup-os/contracts/agents";
import type { HarnessKind, HarnessSkill } from "@startup-os/contracts/harness";

import { useState, type ReactNode } from "react";

import { AgentEditor } from "./agent-editor";
import { CatalogRow, CatalogSection } from "./catalog-section";
import { harnessOptions } from "./harness-meta";
import { SkillEditor } from "./skill-editor";
import { Button } from "@/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/primitives/dialog";
import { Label } from "@/ui/primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/primitives/select";
import { PicturePreview } from "@/ui/upload/picture-preview";

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
  catalog?: AgentCatalog;
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
  const [deleteError, setDeleteError] = useState<string>();
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
          <CatalogSection
            title="Agents"
            label="Agent actors"
            description="Choose a harness and instructions for your agent actor."
            addLabel="Create agent"
            onAdd={() => setEditor({ kind: "agent" })}
            empty={!catalog.agents.length}
          >
            {catalog.agents.map((agent) => (
              <CatalogRow
                key={agent.id}
                name={agent.name}
                picture={
                  <PicturePreview
                    src={agent.image}
                    alt={`${agent.name} profile picture`}
                    className="size-10 shrink-0 rounded-full object-cover"
                    fallback={
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm"
                        aria-hidden="true"
                      >
                        {agent.name.slice(0, 2).toUpperCase()}
                      </span>
                    }
                  />
                }
                detail={`${harnessOptions.find((option) => option.value === agent.harness)?.label ?? agent.harness} · ${agent.enabled ? "Enabled" : "Disabled"}${agent.useStartupDefaults ? " · Startup OS defaults" : ""}`}
                disabled={pending}
                onEdit={() => setEditor({ kind: "agent", id: agent.id })}
                onDelete={() => {
                  setDeleteError(undefined);
                  setDeleting({ kind: "agent", id: agent.id, name: agent.name });
                }}
              />
            ))}
          </CatalogSection>
          <div className="grid gap-2">
            <h3 className="font-semibold">Device configuration</h3>
            <p className="text-sm text-muted-foreground">
              Skills are native files on this device, not database records. Scan the selected
              organization's local configuration to find them.
            </p>
            <div className="grid max-w-sm gap-2">
              <Label htmlFor="configuration-harness">Configuration harness</Label>
              <Select
                value={localHarness}
                disabled={pending || localLoading}
                onValueChange={(value) => {
                  const option = harnessOptions.find((entry) => entry.value === value);
                  if (option) onLocalHarnessChange(option.value);
                }}
              >
                <SelectTrigger id="configuration-harness">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {harnessOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!localAvailable ? (
              <p role="status">
                Local configuration requires Electron and a selected organization.
              </p>
            ) : (
              <Button
                className="justify-self-start"
                variant="outline"
                disabled={localLoading || pending}
                onClick={onScan}
              >
                {localLoading ? "Scanning…" : "Scan local configuration"}
              </Button>
            )}
            {localError && (
              <p role="alert" className="text-destructive">
                {localError.message}
              </p>
            )}
          </div>
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
                  setDeleteError(undefined);
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
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleting(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              This deletes the selected definition. Native conversation history is not deleted. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDeleting(undefined)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (!deleting) return;
                setDeleteError(undefined);
                void onDelete(deleting.kind, deleting.id)
                  .then(() => setDeleting(undefined))
                  .catch((cause: unknown) =>
                    setDeleteError(
                      cause instanceof Error ? cause.message : "Could not delete definition.",
                    ),
                  );
              }}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
