import {
  agentTriggers,
  type AgentRunSettings,
  type AgentTriggerSetting,
} from "@startup-os/contracts/agents";

import { useState } from "react";

import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { homeDeviceLabel } from "@/lib/agents/triggers";
import { Monitor } from "lucide-react";

export function AgentRunSettingsDialog({
  name,
  settings,
  canRunHere,
  moving,
  saving,
  error,
  onRunHere,
  onSave,
  onClose,
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
  onClose: () => void;
}) {
  const [triggers, setTriggers] = useState(settings.triggers);
  const update = (kind: AgentTriggerSetting["kind"], change: Partial<AgentTriggerSetting>) =>
    setTriggers((current) =>
      current.map((trigger) => (trigger.kind === kind ? { ...trigger, ...change } : trigger)),
    );
  const device = settings.homeDevice;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="wrap-anywhere">Run settings for {name}</DialogTitle>
          <DialogDescription>
            Choose where this agent runs and which messages start it.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="agent-home-title" className="space-y-2">
            <h3 id="agent-home-title" className="text-sm font-medium">
              Runs on
            </h3>
            <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <Monitor aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 text-sm">{homeDeviceLabel(device)}</span>
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
            {!canRunHere && !device?.current && (
              <p className="text-xs text-muted-foreground">
                Open Startup OS on a desktop to run this agent there.
              </p>
            )}
          </section>
          <section aria-labelledby="agent-triggers-title" className="space-y-4">
            <h3 id="agent-triggers-title" className="text-sm font-medium">
              Triggers
            </h3>
            {triggers.map((trigger) => {
              const meta = agentTriggers[trigger.kind];
              const id = `agent-trigger-${trigger.kind}`;
              return (
                <div key={trigger.kind} className="border-t pt-4">
                  <Field orientation="horizontal">
                    <Switch
                      id={id}
                      checked={trigger.enabled}
                      disabled={saving}
                      onCheckedChange={(enabled) => update(trigger.kind, { enabled })}
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={id}>{meta.title}</FieldLabel>
                      <FieldDescription>{meta.description}</FieldDescription>
                    </FieldContent>
                  </Field>
                </div>
              );
            })}
          </section>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <PendingButton pending={saving} pendingLabel="Saving…" onClick={() => onSave(triggers)}>
            Save
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
