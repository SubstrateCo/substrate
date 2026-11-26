import {
  agentTriggers,
  type AgentRunSettings,
  type AgentTriggerSetting,
} from "@substrate/contracts/agents";

import { useState, type ComponentProps, type ReactNode } from "react";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { useRegisterDraft } from "@/components/feedback/unsaved-drafts";
import {
  SettingsCard,
  SettingsFooter,
  SettingsRow,
  SettingsSection,
} from "@/components/layout/settings-section";
import { Switch } from "@/components/ui/switch";
import { homeDeviceLabel } from "@/lib/agents/triggers";
import { Laptop } from "lucide-react";

export function RunsOnCard({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <SettingsCard title="Runs on">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
          <Laptop aria-hidden="true" className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">{children}</div>
        {action}
      </div>
    </SettingsCard>
  );
}

export function TriggerCard({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <SettingsCard title="Triggers" description="Messages that start this agent." footer={footer}>
      <ul className="-mx-5 -mb-5 divide-y border-t">{children}</ul>
    </SettingsCard>
  );
}

export function TriggerRow(props: ComponentProps<typeof SettingsRow>) {
  return (
    <li className="px-2">
      <SettingsRow {...props} />
    </li>
  );
}

export function AgentRunSettingsView({
  name,
  settings,
  callers,
  canRunHere,
  moving,
  saving,
  moveError,
  saveError,
  onRunHere,
  onSave,
}: {
  name: string;
  settings: AgentRunSettings;
  callers?: ReactNode;
  /** Only the desktop app can become an agent's home. */
  canRunHere: boolean;
  moving: boolean;
  saving: boolean;
  /** Moving the agent to this device failed. */
  moveError?: Error | null;
  /** Saving the triggers failed. */
  saveError?: Error | null;
  onRunHere: () => void;
  onSave: (triggers: AgentTriggerSetting[], onSuccess: () => void) => void;
}) {
  const [draft, setDraft] = useState<AgentTriggerSetting[] | null>(null);
  const triggers = draft ?? settings.triggers;
  const update = (kind: AgentTriggerSetting["kind"], change: Partial<AgentTriggerSetting>) =>
    setDraft((current) =>
      (current ?? settings.triggers).map((trigger) =>
        trigger.kind === kind ? { ...trigger, ...change } : trigger,
      ),
    );
  const device = settings.homeDevice;
  const dirty = triggers.some(
    (trigger) =>
      settings.triggers.find((saved) => saved.kind === trigger.kind)?.enabled !== trigger.enabled,
  );
  useRegisterDraft("run", dirty, () => setDraft(null));
  return (
    <SettingsSection
      title="Run settings"
      label={`Run settings for ${name}`}
      description="Choose where this agent runs and which messages start it."
    >
      <RunsOnCard
        action={
          canRunHere &&
          !device?.current && (
            <PendingButton size="sm" variant="outline" pending={moving} onClick={onRunHere}>
              Run on this device
            </PendingButton>
          )
        }
      >
        <p className="text-sm font-medium">{homeDeviceLabel(device)}</p>
        {!canRunHere && !device?.current && (
          <p className="text-xs text-muted-foreground">
            Open Substrate on a desktop to run this agent there.
          </p>
        )}
        <FormMessage
          error={moveError}
          errorDescription="We couldn’t move this agent to this device. Try again."
        />
      </RunsOnCard>
      {callers}
      <TriggerCard
        footer={
          <SettingsFooter
            dirty={dirty}
            pending={saving}
            error={
              saveError &&
              actionErrorMessage(saveError, "We couldn’t save run settings. Try again.")
            }
            onDiscard={() => setDraft(null)}
            onSave={() => onSave(triggers, () => setDraft(null))}
          />
        }
      >
        {triggers.map((trigger) => {
          const meta = agentTriggers[trigger.kind];
          const id = `agent-trigger-${trigger.kind}`;
          return (
            <TriggerRow
              key={trigger.kind}
              label={meta.title}
              description={meta.description}
              htmlFor={id}
              control={
                <Switch
                  id={id}
                  checked={trigger.enabled}
                  disabled={saving}
                  onCheckedChange={(enabled) => update(trigger.kind, { enabled })}
                />
              }
            />
          );
        })}
      </TriggerCard>
    </SettingsSection>
  );
}
