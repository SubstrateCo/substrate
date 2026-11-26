import type { SaveAgentInput } from "@substrate/contracts/agents";
import type { HarnessKind } from "@substrate/contracts/harness";

import { useQuery } from "@tanstack/react-query";

import { AgentSettingsLoading } from "./agent-settings-loading";
import { AgentConfiguration } from "./device/agent-configuration";
import { AgentForm, type AgentModelField } from "./editors/agent-form";
import { AgentPicture } from "./editors/agent-picture";
import { StartupInstructions } from "./editors/startup-instructions";
import { HarnessAvailability } from "./model-picker/harness-availability";
import { ModelPicker } from "./model-picker/model-picker";
import { AgentRunSettings } from "./run-settings/agent-run-settings";
import { HarnessAccount } from "./sign-in/harness-account";
import { DangerZoneCard } from "@/components/feedback/danger-zone-card";
import { ErrorState } from "@/components/feedback/error-state";
import { FormDialog } from "@/components/feedback/form-dialog";
import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import type { AgentSettingsSection } from "@/lib/agent-work/agent-sections";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { useAgentMutations } from "@/queries/agents/mutations";
import { toast } from "sonner";

/**
 * Without agentId, the Create agent dialog. With it, the selected settings section of that
 * agent; the page around it owns the section list.
 */
export function AgentSettings({
  agentId,
  section = "general",
  onSectionChange,
  onClose,
  onCreated,
}: {
  agentId?: string;
  section?: AgentSettingsSection;
  onSectionChange?: (section: AgentSettingsSection) => void;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const { save, remove } = useAgentMutations(userId);
  const createFocus = useFocusReturn();
  const pending = save.isPending || remove.isPending;
  const agent = catalog.data?.agents.find((item) => item.id === agentId);
  const runSettings = catalog.data?.runSettings.find((item) => item.agentId === agentId);
  const renderModel = ({ id, harness, model, disabled, onChange }: AgentModelField) => (
    <HarnessAccount agentId={agent?.id} harness={harness}>
      {(signIn) => (
        <>
          <ModelPicker
            key={`${userId}/${organizationId}`}
            id={id}
            agentId={agent?.id}
            harness={harness}
            model={model}
            disabled={disabled}
            onSignIn={signIn}
            onChange={onChange}
          />
          <HarnessAvailability harness={harness} />
        </>
      )}
    </HarnessAccount>
  );
  const renderStartupInstructions = ({ harness, name }: { harness: HarnessKind; name: string }) => (
    <StartupInstructions harness={harness} name={name} agentId={agent?.id} />
  );
  function onSave(input: SaveAgentInput, options: { onSuccess: () => void }) {
    save.mutate(input, {
      // An edit shows its save in the settings footer. A new agent opens in its own page.
      onSuccess: (saved) => {
        if (!input.id) {
          toast.success("Agent created.");
          onCreated?.(saved.id);
        }
        options.onSuccess();
      },
    });
  }
  return (
    <section aria-label="Agent settings" className="grid gap-8">
      {catalog.error && (
        <ErrorState
          variant="compact"
          title="Couldn’t load agent settings"
          onRetry={() => void catalog.refetch()}
        />
      )}
      {agentId && catalog.isPending && <AgentSettingsLoading section={section} />}
      {agent && (
        <AgentForm
          key={agent.id}
          renderModel={renderModel}
          renderStartupInstructions={renderStartupInstructions}
          agent={agent}
          section={section}
          onSectionChange={onSectionChange}
          picture={<AgentPicture agentId={agent.id} name={agent.name} image={agent.image} />}
          configuration={
            (section === "skills" || section === "mcps") && (
              <AgentConfiguration
                key={`${agent.harness}/${section}`}
                agentId={agent.id}
                harness={agent.harness}
                section={section}
                defaults={agent.useStartupDefaults}
              />
            )
          }
          pending={pending}
          onSave={onSave}
          // The mutation outlives each agent's form; show only this agent's failure.
          error={save.variables?.id === agent.id ? save.error : null}
          onResetError={() => save.reset()}
          runSettings={
            runSettings && (
              <AgentRunSettings key={agent.id} name={agent.name} settings={runSettings} />
            )
          }
          deleteAction={
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
              onConfirm={(onDeleted) =>
                remove.mutate(agent.id, {
                  onSuccess: () => {
                    toast.success("Agent deleted.");
                    onDeleted();
                    onClose();
                  },
                })
              }
            />
          }
        />
      )}
      {!agentId && (
        <AgentForm
          renderModel={renderModel}
          renderStartupInstructions={renderStartupInstructions}
          pending={pending}
          error={save.variables && !save.variables.id ? save.error : null}
          onResetError={() => save.reset()}
          renderCreate={({ fields, ...editor }) => (
            <FormDialog
              {...editor}
              title="New agent"
              description="An agent answers your messages and helps in conversations you add it to. It runs on your desktop, and you can change everything later."
              saveLabel="Create agent"
              size="lg"
              onClose={onClose}
              onRestoreFocus={createFocus.restore}
            >
              {fields}
            </FormDialog>
          )}
          onSave={(input, options) =>
            onSave(input, {
              onSuccess: () => {
                options.onSuccess();
                onClose();
              },
            })
          }
        />
      )}
    </section>
  );
}
