import type {
  DesktopUpdatesAPI,
  DesktopUpdateStatus,
} from "@substrate/contracts/desktop/updates-ipc";

import { PendingButton } from "@/components/feedback/pending-button";
import { SettingsSection, SettingsRow } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { useDesktopUpdates } from "@/hooks/use-desktop-updates";
import { updatesBridge } from "@/lib/desktop/bridges";
import { useDesktopUpdateCommand } from "@/queries/desktop/mutations";
import { ArrowUpRight } from "lucide-react";

// Only packaged desktop builds update. Browsers and development builds show nothing.
export function DesktopUpdateSettings() {
  const bridge = updatesBridge();
  if (!bridge) return null;
  return <ConnectedUpdateSettings bridge={bridge} />;
}

function ConnectedUpdateSettings({ bridge }: { bridge: DesktopUpdatesAPI }) {
  const status = useDesktopUpdates(bridge);
  const command = useDesktopUpdateCommand(bridge);
  if (!status || status.install === "unavailable") return null;

  return (
    <DesktopUpdateSettingsView
      status={status}
      pending={command.pending}
      onCheck={() => command.run("check")}
      onInstall={() => command.run("install")}
      onDownload={() => command.run("download")}
    />
  );
}

function updateDescription({ install, state }: DesktopUpdateStatus) {
  switch (state.status) {
    case "checking":
      return "Checking for updates";
    case "current":
      return "You’re up to date.";
    case "available":
      return install === "manual"
        ? `Version ${state.version} is available. Download it and replace the app in Applications.`
        : `Version ${state.version} is available.`;
    case "downloading":
      return `Downloading version ${state.version} (${Math.floor(state.percent)}%).`;
    case "ready":
      return `Version ${state.version} is ready. Restart Substrate to install it.`;
    case "installing":
      return `Stopping background work before installing version ${state.version}. Substrate will reopen automatically.`;
    case "error":
      return "Couldn’t finish the update. Try again, or close and reopen Substrate.";
    case "idle":
      return;
  }
}

function DesktopUpdateSettingsView({
  status,
  pending,
  onCheck,
  onInstall,
  onDownload,
}: {
  status: DesktopUpdateStatus;
  pending: boolean;
  onCheck: () => void;
  onInstall: () => void;
  onDownload: () => void;
}) {
  return (
    <div id="updates" tabIndex={-1} className="scroll-mt-6">
      <SettingsSection title="Updates">
        <SettingsRow
          label={`Substrate ${status.appVersion}`}
          description={<span role="status">{updateDescription(status)}</span>}
          control={
            <UpdateControl
              status={status}
              pending={pending}
              onCheck={onCheck}
              onInstall={onInstall}
              onDownload={onDownload}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}

/** Restart once an automatic update is ready, download a manual one, or check again. */
function UpdateControl({
  status: { install, state },
  pending,
  onCheck,
  onInstall,
  onDownload,
}: {
  status: DesktopUpdateStatus;
  pending: boolean;
  onCheck: () => void;
  onInstall: () => void;
  onDownload: () => void;
}) {
  if (state.status === "installing") return <PendingButton pending>Restarting…</PendingButton>;
  if (state.status === "ready" && install === "automatic")
    return (
      <PendingButton pending={pending} onClick={onInstall}>
        Restart to update
      </PendingButton>
    );
  if (state.status === "available" && install === "manual")
    return (
      <Button disabled={pending} onClick={onDownload}>
        <ArrowUpRight aria-hidden="true" />
        Download
      </Button>
    );
  return (
    <PendingButton
      variant="outline"
      pending={pending || state.status === "checking"}
      disabled={state.status === "downloading"}
      onClick={onCheck}
    >
      Check for updates
    </PendingButton>
  );
}
