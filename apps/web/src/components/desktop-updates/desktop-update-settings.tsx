import type {
  DesktopUpdatesAPI,
  DesktopUpdateStatus,
} from "@substrate/contracts/desktop/updates-ipc";

import { useState } from "react";

import { PendingButton } from "@/components/feedback/pending-button";
import { SettingsCard, SettingsRow } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { useDesktopUpdates } from "@/hooks/use-desktop-updates";
import { updatesBridge } from "@/lib/desktop/bridges";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

type UpdateCommand = () => Promise<DesktopUpdateStatus | void>;

// Only packaged desktop builds update. Browsers and development builds show nothing.
export function DesktopUpdateSettings() {
  const bridge = updatesBridge();
  if (!bridge) return null;
  return <ConnectedUpdateSettings bridge={bridge} />;
}

function ConnectedUpdateSettings({ bridge }: { bridge: DesktopUpdatesAPI }) {
  const status = useDesktopUpdates(bridge);
  const [pending, setPending] = useState(false);
  if (!status || status.install === "unavailable") return null;

  const run = (action: UpdateCommand) => runUpdateCommand(action, setPending);
  return (
    <DesktopUpdateSettingsView
      status={status}
      pending={pending}
      onCheck={() => void run(() => bridge.checkForUpdates())}
      onInstall={() => void run(() => bridge.installNow())}
      onDownload={() => void run(() => bridge.openDownloadPage())}
    />
  );
}

// Outside the component: React Compiler cannot compile try/finally.
async function runUpdateCommand(action: UpdateCommand, setPending: (pending: boolean) => void) {
  setPending(true);
  try {
    await action();
  } catch {
    toast.error("We couldn’t finish the update. Try again.");
  } finally {
    setPending(false);
  }
}

function updateDescription({ install, state }: DesktopUpdateStatus) {
  switch (state.status) {
    case "checking":
      return "Checking for updates…";
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
    case "error":
      return "Couldn’t check for updates. Check your connection and try again.";
    case "idle":
      return install === "automatic"
        ? "Substrate checks for updates every few hours and installs them when you restart."
        : "Substrate checks for updates every few hours.";
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
  const { install, state } = status;
  let control;
  if (state.status === "ready" && install === "automatic")
    control = (
      <PendingButton pending={pending} pendingLabel="Restarting" onClick={onInstall}>
        Restart to update
      </PendingButton>
    );
  else if (state.status === "available" && install === "manual")
    control = (
      <Button disabled={pending} onClick={onDownload}>
        <ArrowUpRight aria-hidden="true" />
        Download
      </Button>
    );
  else
    control = (
      <PendingButton
        variant="outline"
        pending={pending || state.status === "checking"}
        pendingLabel="Checking"
        disabled={state.status === "downloading"}
        onClick={onCheck}
      >
        Check for updates
      </PendingButton>
    );
  return (
    <div id="updates" tabIndex={-1} className="scroll-mt-6">
      <SettingsCard title="Updates">
        <SettingsRow
          label={`Substrate ${status.appVersion}`}
          description={<span role="status">{updateDescription(status)}</span>}
          control={control}
        />
      </SettingsCard>
    </div>
  );
}
