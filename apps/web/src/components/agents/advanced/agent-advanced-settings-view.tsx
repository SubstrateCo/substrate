import type { AgentOptionalAppId } from "@substrate/contracts/agents";

import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { SettingsRow, SettingsSection } from "@/components/layout/settings-section";
import { Switch } from "@/components/ui/switch";

const appLabels: Record<AgentOptionalAppId, string> = {
  tasks: "Tasks",
  crm: "CRM",
  inbox: "Inbox",
};

export type WorkingFolder =
  | { kind: "here"; path: string | null; reading: boolean }
  | { kind: "elsewhere"; deviceName: string | null };

function folderDetail(folder: WorkingFolder) {
  if (folder.kind === "elsewhere")
    return folder.deviceName
      ? `Set on ${folder.deviceName}, the desktop it runs on.`
      : "Set on the desktop it runs on.";
  if (folder.reading) return "Reading this agent’s folder";
  return folder.path ?? "Its own folder in Substrate.";
}

export function AgentAdvancedSettingsView({
  folder,
  guide,
  apps,
  saving,
  choosing,
  clearing,
  saveError,
  folderError,
  onChooseFolder,
  onClearFolder,
  onGuideChange,
  onAppChange,
}: {
  folder: WorkingFolder;
  guide: boolean;
  apps: readonly { app: AgentOptionalAppId; enabled: boolean }[];
  saving: boolean;
  choosing: boolean;
  clearing: boolean;
  saveError?: Error | null;
  folderError?: Error | null;
  onChooseFolder: () => void;
  onClearFolder: () => void;
  onGuideChange: (guide: boolean) => void;
  onAppChange: (app: AgentOptionalAppId, enabled: boolean) => void;
}) {
  const busy = choosing || clearing;
  return (
    <SettingsSection
      title="Advanced"
      description="Choose where it works and which Substrate apps it uses. It can always reply, message, search and start helpers."
    >
      <div className="grid min-w-0 divide-y sm:-mx-3">
        <SettingsRow
          label="Working folder"
          description={<span className="break-all">{folderDetail(folder)}</span>}
          control={
            folder.kind === "here" && (
              <>
                {folder.path && (
                  <PendingButton
                    size="sm"
                    variant="ghost"
                    pending={clearing}
                    disabled={busy}
                    onClick={onClearFolder}
                  >
                    Use its own folder
                  </PendingButton>
                )}
                <PendingButton
                  size="sm"
                  variant="outline"
                  pending={choosing}
                  disabled={busy || folder.reading}
                  onClick={onChooseFolder}
                >
                  Choose folder
                </PendingButton>
              </>
            )
          }
        />
        <SettingsRow
          label="Substrate guide"
          description="Adds Substrate’s workspace guide before its instructions."
          htmlFor="agent-substrate-guide"
          control={
            <Switch
              id="agent-substrate-guide"
              checked={guide}
              disabled={saving}
              onCheckedChange={onGuideChange}
            />
          }
        />
        {apps.map(({ app, enabled }) => {
          const id = `agent-app-${app}`;
          return (
            <SettingsRow
              key={app}
              label={appLabels[app]}
              description={`Its ${appLabels[app]} skill and tools.`}
              htmlFor={id}
              control={
                <Switch
                  id={id}
                  checked={enabled}
                  disabled={saving}
                  onCheckedChange={(next) => onAppChange(app, next)}
                />
              }
            />
          );
        })}
      </div>
      <FormMessage
        error={folderError}
        errorDescription="We couldn’t use that folder. Choose a folder outside Substrate’s own folders."
      />
      <FormMessage error={saveError} errorDescription="We couldn’t save that change. Try again." />
    </SettingsSection>
  );
}
