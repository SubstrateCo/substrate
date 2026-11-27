import { agentTriggers, type AgentTriggerSetting } from "@substrate/contracts/agents";

import type { ReactNode } from "react";

import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { SettingsRow, SettingsSection } from "@/components/layout/settings-section";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { homeDeviceLabel } from "@/lib/agents/triggers";
import { Laptop } from "lucide-react";

type HomeDevice = { name: string; online: boolean; current: boolean } | null;

/** "When it runs": the shared frame of the card and its loading view. */
export function WhenItRunsCard({ children }: { children: ReactNode }) {
  return (
    <SettingsSection title="When it runs">
      <div className="grid min-w-0 divide-y sm:-mx-3">{children}</div>
    </SettingsSection>
  );
}

export function RunsOnRow({ device, action }: { device: ReactNode; action?: ReactNode }) {
  return (
    <Item size="xs">
      <ItemMedia variant="icon">
        <Laptop aria-hidden="true" className="text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0">{device}</ItemContent>
      {action && <ItemActions>{action}</ItemActions>}
    </Item>
  );
}

/**
 * Where the agent runs, whether it is on, and which messages start it. Each switch saves at once,
 * so this card has no footer and holds no draft.
 */
export function AgentRunSettingsView({
  enabled,
  triggers,
  homeDevice,
  canRunHere,
  moving,
  saving,
  moveError,
  saveError,
  onRunHere,
  onEnabledChange,
  onTriggerChange,
}: {
  enabled: boolean;
  triggers: readonly AgentTriggerSetting[];
  homeDevice: HomeDevice;
  /** Only the desktop app can become an agent's home. */
  canRunHere: boolean;
  moving: boolean;
  /** A switch's change is being saved. */
  saving: boolean;
  /** Moving the agent to this device failed. */
  moveError?: Error | null;
  /** Saving a switch failed. */
  saveError?: Error | null;
  onRunHere: () => void;
  onEnabledChange: (enabled: boolean) => void;
  onTriggerChange: (kind: AgentTriggerSetting["kind"], enabled: boolean) => void;
}) {
  return (
    <WhenItRunsCard>
      <RunsOnRow
        device={
          <>
            <p className="text-sm font-medium">{homeDeviceLabel(homeDevice)}</p>
            <FormMessage
              error={moveError}
              errorDescription="We couldn’t move this agent to this device. Try again."
            />
          </>
        }
        action={
          canRunHere &&
          !homeDevice?.current && (
            <PendingButton size="sm" variant="outline" pending={moving} onClick={onRunHere}>
              Run on this device
            </PendingButton>
          )
        }
      />
      <SettingsRow
        label="Enabled"
        htmlFor="agent-enabled"
        control={
          <Switch
            id="agent-enabled"
            checked={enabled}
            disabled={saving}
            onCheckedChange={onEnabledChange}
          />
        }
      />
      {triggers.map((trigger) => {
        const meta = agentTriggers[trigger.kind];
        const id = `agent-trigger-${trigger.kind}`;
        return (
          <SettingsRow
            key={trigger.kind}
            label={meta.title}
            htmlFor={id}
            control={
              <Switch
                id={id}
                checked={trigger.enabled}
                disabled={saving}
                onCheckedChange={(next) => onTriggerChange(trigger.kind, next)}
              />
            }
          />
        );
      })}
      <FormMessage error={saveError} errorDescription="We couldn’t save that change. Try again." />
    </WhenItRunsCard>
  );
}
