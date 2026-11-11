import type { SaveAgentInput } from "@substrate/contracts/agents";
import type { HarnessKind } from "@substrate/contracts/harness";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { AgentConfiguration } from "./device/agent-configuration";
import { AgentForm, type AgentSection } from "./editors/agent-form";
import { AgentPicture } from "./editors/agent-picture";
import { AgentRunSettings } from "./run-settings/agent-run-settings";
import type { AgentSettingsSection } from "@/components/agent-work/app/agent-sections";
import { DeleteRecordCard } from "@/components/feedback/delete-record-card";
import { ErrorState } from "@/components/feedback/error-state";
import { FormDialog } from "@/components/feedback/form-dialog";
import { LoadingState } from "@/components/feedback/loading-state";
import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { useAgentMutations } from "@/queries/agents/mutations";
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
  runSettingsDirty = false,
  onClose,
  onCreated,
}: {
  userId: string;
  organizationId?: string | null;
  agentId?: string;
  section?: AgentSettingsSection;
  onSectionChange?: (section: AgentSettingsSection) => void;
  runSettingsDirty?: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const { save, remove } = useAgentMutations(userId);
  const createFocus = useFocusReturn();
  const [runSettingsDraft, setRunSettingsDraft] = useState(0);
  const pending = save.isPending || remove.isPending;
  const agent = catalog.data?.agents.find((item) => item.id === agentId);
  const runSettings = catalog.data?.runSettings.find((item) => item.agentId === agentId);
  async function onSave(input: SaveAgentInput) {
    const saved = await save.mutateAsync(input, {
      // An edit shows its save in the settings footer. A new agent opens in its own page.
      onSuccess: () => {
        if (!input.id) toast.success("Agent created.");
      },
    });
    if (!input.id) onCreated?.(saved.id);
  }
  const renderConfiguration = ({
    harness,
    section: configured,
    defaults,
    agentId: configuredAgentId,
  }: {
    harness: HarnessKind;
    section: AgentSection;
    defaults: boolean;
    agentId?: string;
  }) => (
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
              />
            )
          }
          deleteAction={
            <DeleteRecordCard
              title="Delete agent"
              actionLabel={`Delete ${agent.name}`}
              description={`Removes ${agent.name} and its settings. Messages it posted stay.`}
              confirmTitle={`Delete ${agent.name}?`}
              confirmDescription={`This removes ${agent.name} and its settings. Messages it already posted stay in their conversations. You can’t undo this.`}
              pending={pending}
              error={remove.error}
              errorDescription="We couldn’t delete this agent. Try again."
              onReset={() => remove.reset()}
              onRestoreFocus={() =>
                document.querySelector<HTMLButtonElement>('button[aria-label="New agent"]')?.focus()
              }
              onDelete={async () => {
                await remove.mutateAsync(agent.id, {
                  onSuccess: () => toast.success("Agent deleted."),
                });
                onClose();
              }}
            />
          }
        />
      )}
      {!agentId && (
        <AgentForm
          userId={userId}
          organizationId={organizationId}
          renderConfiguration={renderConfiguration}
          pending={pending}
          renderCreate={({ fields, ...editor }) => (
            <FormDialog
              {...editor}
              title="New agent"
              description="An agent answers your messages and helps in conversations you add it to. It runs on your desktop, and you can change everything later."
              saveLabel="Create agent"
              pendingLabel="Creating…"
              onClose={onClose}
              onRestoreFocus={createFocus.restore}
            >
              {fields}
            </FormDialog>
          )}
          onSave={async (input) => {
            await onSave(input);
            onClose();
          }}
        />
      )}
    </section>
  );
}
