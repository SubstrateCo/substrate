import type { SaveAgentInput } from "@substrate/contracts/agents";
import type { HarnessKind } from "@substrate/contracts/harness";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRef, useState } from "react";

import { AgentConfiguration } from "./device/agent-configuration";
import { AgentForm, type AgentSection } from "./editors/agent-form";
import { AgentPicture } from "./editors/agent-picture";
import { AgentRunSettings } from "./run-settings/agent-run-settings";
import { saveAgent, deleteAgent } from "@/api/agents/requests";
import type { AgentSettingsSection } from "@/components/agent-work/app/agent-sections";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { SettingsCard } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { queryKeys } from "@/queries/keys";
import { toast } from "sonner";

/**
 * Without agentId, the Create agent dialog. With it, the selected settings section of that
 * agent; the page around it owns the section list.
 */
export function AgentSettings({
  userId,
  organizationId,
  agentId,
  section = "general",
  onSectionChange,
  onUnsavedSectionsChange,
  onClose,
  onCreated,
}: {
  userId: string;
  organizationId?: string | null;
  agentId?: string;
  section?: AgentSettingsSection;
  onSectionChange?: (section: AgentSettingsSection) => void;
  /** The sections of this agent with unsaved changes, for the page's section list. */
  onUnsavedSectionsChange?: (sections: readonly AgentSettingsSection[]) => void;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const client = useQueryClient();
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.agents(userId) });
  const save = useMutation({
    mutationFn: saveAgent,
    onSuccess: async () => {
      toast.success("Agent saved.");
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: deleteAgent,
    onSuccess: async () => {
      toast.success("Agent deleted.");
      await invalidate();
    },
  });
  const [deleting, setDeleting] = useState(false);
  const deleteLauncher = useRef<HTMLButtonElement>(null);
  const createLauncher = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [runSettingsDirty, setRunSettingsDirty] = useState(false);
  const [runSettingsDraft, setRunSettingsDraft] = useState(0);
  const pending = save.isPending || remove.isPending;
  const agent = catalog.data?.agents.find((item) => item.id === agentId);
  const runSettings = catalog.data?.runSettings.find((item) => item.agentId === agentId);
  async function onSave(input: SaveAgentInput) {
    const saved = await save.mutateAsync(input);
    if (!input.id) onCreated?.(saved.id);
  }
  const renderConfiguration = (
    harness: HarnessKind,
    configured: AgentSection,
    defaults: boolean,
    configuredAgentId?: string,
  ) => (
    <AgentConfiguration
      key={`${harness}/${configured}`}
      userId={userId}
      organizationId={organizationId}
      agentId={configuredAgentId}
      harness={harness}
      section={configured}
      defaults={defaults}
    />
  );
  return (
    <section aria-label="Agent settings" className="grid gap-8">
      {catalog.error && (
        <ErrorState
          compact
          title="Couldn’t load agent settings"
          onRetry={() => void catalog.refetch()}
        />
      )}
      {agentId && catalog.isPending && (
        <LoadingState label="Loading agent settings" variant="compact" />
      )}
      {agent && (
        <AgentForm
          key={agent.id}
          userId={userId}
          organizationId={organizationId}
          agent={agent}
          section={section}
          onSectionChange={onSectionChange}
          onUnsavedSectionsChange={onUnsavedSectionsChange}
          picture={
            <AgentPicture
              userId={userId}
              agentId={agent.id}
              name={agent.name}
              image={agent.image}
            />
          }
          renderConfiguration={renderConfiguration}
          pending={pending}
          onSave={onSave}
          runSettingsDirty={runSettingsDirty}
          // A new key remounts run settings, which drops their draft.
          onDiscardRunSettings={() => setRunSettingsDraft((count) => count + 1)}
          runSettings={
            runSettings && (
              <AgentRunSettings
                key={`${agent.id}/${runSettingsDraft}`}
                userId={userId}
                name={agent.name}
                settings={runSettings}
                onDirtyChange={setRunSettingsDirty}
              />
            )
          }
          deleteAction={
            <SettingsCard label="Delete agent" tone="destructive" className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-medium">Delete agent</p>
                  <p className="text-sm text-muted-foreground">
                    Removes {agent.name} and its settings. Messages it posted stay.
                  </p>
                </div>
                <Button
                  ref={deleteLauncher}
                  size="sm"
                  variant="destructive-ghost"
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
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !pending) onClose();
          }}
        >
          <DialogContent
            size="lg"
            onCloseAutoFocus={(event) => {
              if (createLauncher.current?.isConnected) {
                event.preventDefault();
                createLauncher.current.focus();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>New agent</DialogTitle>
              <DialogDescription>
                An agent answers your messages and helps in conversations you add it to. It runs on
                your desktop, and you can change everything later.
              </DialogDescription>
            </DialogHeader>
            <AgentForm
              userId={userId}
              organizationId={organizationId}
              renderConfiguration={renderConfiguration}
              pending={pending}
              onCancel={onClose}
              onSave={async (input) => {
                await onSave(input);
                onClose();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {agent && deleting && (
        <ConfirmDialog
          title={`Delete ${agent.name}?`}
          description={`This removes ${agent.name} and its settings. Messages it already posted stay in their conversations. You can’t undo this.`}
          confirmLabel="Delete agent"
          pendingLabel="Deleting…"
          destructive
          pending={pending}
          error={remove.error}
          errorDescription="We couldn’t delete this agent. Try again."
          onRestoreFocus={() => {
            if (deleteLauncher.current?.isConnected) deleteLauncher.current.focus();
            else
              document.querySelector<HTMLButtonElement>('button[aria-label="New agent"]')?.focus();
          }}
          onConfirm={() =>
            remove.mutate(agent.id, {
              onSuccess: () => {
                setDeleting(false);
                onClose();
              },
            })
          }
          onClose={() => {
            setDeleting(false);
            remove.reset();
          }}
        />
      )}
    </section>
  );
}
