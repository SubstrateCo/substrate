import {
  agentTriggers,
  type AgentRunSettings,
  type AgentTriggerSetting,
} from "@startup-os/contracts/agents";

import { useEffect, useState } from "react";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { PendingButton } from "@/components/feedback/pending-button";
import {
  SettingsCard,
  SettingsFooter,
  SettingsSection,
} from "@/components/layout/settings-section";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { homeDeviceLabel } from "@/lib/agents/triggers";
import { Laptop } from "lucide-react";

export function AgentRunSettingsView({
  name,
  settings,
  canRunHere,
  moving,
  saving,
  error,
  onRunHere,
  onSave,
  onDirtyChange,
}: {
  name: string;
  settings: AgentRunSettings;
  /** Only the desktop app can become an agent's home. */
  canRunHere: boolean;
  moving: boolean;
  saving: boolean;
  error?: Error | null;
  onRunHere: () => void;
  onSave: (triggers: AgentTriggerSetting[]) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [triggers, setTriggers] = useState(settings.triggers);
  const update = (kind: AgentTriggerSetting["kind"], change: Partial<AgentTriggerSetting>) =>
    setTriggers((current) =>
      current.map((trigger) => (trigger.kind === kind ? { ...trigger, ...change } : trigger)),
    );
  const device = settings.homeDevice;
  const dirty = triggers.some(
    (trigger) =>
      settings.triggers.find((saved) => saved.kind === trigger.kind)?.enabled !== trigger.enabled,
  );
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  return (
    <SettingsSection
      title="Run settings"
      label={`Run settings for ${name}`}
      description="Choose where this agent runs and which messages start it."
    >
      <SettingsCard title="Runs on">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
            <Laptop aria-hidden="true" className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{homeDeviceLabel(device)}</p>
            {!canRunHere && !device?.current && (
              <p className="text-xs text-muted-foreground">
                Open Startup OS on a desktop to run this agent there.
              </p>
            )}
          </div>
          {canRunHere && !device?.current && (
            <PendingButton
              size="sm"
              variant="outline"
              pending={moving}
              pendingLabel="Moving…"
              onClick={onRunHere}
            >
              Run on this device
            </PendingButton>
          )}
        </div>
      </SettingsCard>
      <SettingsCard
        title="Triggers"
        description="Messages that start this agent."
        footer={
          <SettingsFooter
            dirty={dirty}
            pending={saving}
            error={error && actionErrorMessage(error, "We couldn’t save run settings. Try again.")}
            onDiscard={() => setTriggers(settings.triggers)}
            onSave={() => onSave(triggers)}
          />
        }
      >
        <ul className="-mx-5 -mb-5 divide-y border-t">
          {triggers.map((trigger) => {
            const meta = agentTriggers[trigger.kind];
            const id = `agent-trigger-${trigger.kind}`;
            return (
              <li key={trigger.kind} className="px-5 py-4">
                <Field orientation="horizontal" className="items-center">
                  <FieldContent>
                    <FieldLabel htmlFor={id}>{meta.title}</FieldLabel>
                    <FieldDescription>{meta.description}</FieldDescription>
                  </FieldContent>
                  <Switch
                    id={id}
                    checked={trigger.enabled}
                    disabled={saving}
                    onCheckedChange={(enabled) => update(trigger.kind, { enabled })}
                  />
                </Field>
              </li>
            );
          })}
        </ul>
      </SettingsCard>
    </SettingsSection>
  );
}
