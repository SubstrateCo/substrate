import type { SaveAgentInput } from "@startup-os/contracts/agents";
import type { HarnessKind } from "@startup-os/contracts/harness";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { AgentConfiguration } from "./device/agent-configuration";
import { AgentForm, type AgentSection } from "./editors/agent-form";
import { AgentPicture } from "./editors/agent-picture";
import { SettingsCard } from "./layout/settings-section";
import { AgentRunSettings } from "./run-settings/agent-run-settings";
import { saveAgent, deleteAgent } from "@/api/agents/requests";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
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

export function AgentSettings({
  userId,
  organizationId,
  agentId,
  onClose,
  onCreated,
}: {
  userId: string;
  organizationId?: string | null;
  agentId?: string;
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
  const pending = save.isPending || remove.isPending;
  const agent = catalog.data?.agents.find((item) => item.id === agentId);
  const runSettings = catalog.data?.runSettings.find((item) => item.agentId === agentId);
  async function onSave(input: SaveAgentInput) {
    const saved = await save.mutateAsync(input);
    if (!input.id) onCreated?.(saved.id);
  }
  const renderConfiguration = (
    harness: HarnessKind,
    section: AgentSection,
    defaults: boolean,
    configuredAgentId?: string,
  ) => (
    <AgentConfiguration
      key={`${harness}/${section}`}
      userId={userId}
      organizationId={organizationId}
      agentId={configuredAgentId}
      harness={harness}
      section={section}
      defaults={defaults}
    />
  );
  return (
    <section aria-label="Agent settings" className="grid gap-8">
      {catalog.error && (
        <ErrorState
          compact
          title="Couldn't load agent settings"
          description={catalog.error.message}
          onRetry={() => void catalog.refetch()}
        />
      )}
      {agentId && catalog.isPending && (
        <LoadingState label="Loading agent settings" variant="compact" />
      )}
      {agent && (
        <AgentForm
          userId={userId}
          organizationId={organizationId}
          agent={agent}
          picture={<AgentPicture userId={userId} agentId={agent.id} image={agent.image} />}
          renderConfiguration={renderConfiguration}
          pending={pending}
          onSave={onSave}
          runSettings={
            runSettings && (
              <AgentRunSettings
                key={agent.id}
                userId={userId}
                name={agent.name}
                settings={runSettings}
              />
            )
          }
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
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !pending) onClose();
          }}
        >
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Create agent</DialogTitle>
              <DialogDescription>
                Name it and pick a model. Add skills, MCP servers, and triggers in its settings.
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
          description="This deletes the selected definition. Native conversation history is not deleted. This cannot be undone."
          confirmLabel="Delete"
          pendingLabel="Deleting"
          destructive
          pending={pending}
          error={remove.error}
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
