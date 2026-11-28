import type { DesktopUpdatesAPI } from "@substrate/contracts/desktop/updates-ipc";

import { useEffect, useState } from "react";

import { updateNoticeContent, type UpdateNoticeAction } from "./update-notice-content";
import { UpdateRestartDialog } from "./update-restart-dialog";
import { UpdateToast } from "./update-toast";
import { useDesktopUpdates } from "@/hooks/use-desktop-updates";
import { updatesBridge } from "@/lib/desktop/bridges";
import { useDesktopUpdateCommand, type DesktopUpdateCommand } from "@/queries/desktop/mutations";
import { toast } from "sonner";

const toastId = "desktop-update";
const commands: Record<UpdateNoticeAction, DesktopUpdateCommand> = {
  install: "install",
  download: "download",
  retry: "check",
};

export function DesktopUpdateNotice() {
  const bridge = updatesBridge();
  if (!bridge) return null;
  return <UpdateNoticeToast bridge={bridge} />;
}

function UpdateNoticeToast({ bridge }: { bridge: DesktopUpdatesAPI }) {
  const status = useDesktopUpdates(bridge);
  const { pending, run } = useDesktopUpdateCommand(bridge);
  const [dismissedKey, setDismissedKey] = useState<string>();

  useEffect(() => {
    const content = status && updateNoticeContent(status);
    if (!content || content.key === dismissedKey) {
      toast.dismiss(toastId);
      return;
    }
    const { key, action } = content;
    // Sonner reports programmatic dismissals too. Only the person's own close counts, so a
    // dismissal after this notice was replaced or hidden is ignored.
    let replaced = false;
    toast.custom(
      () => (
        <UpdateToast
          content={content}
          pending={pending}
          onClose={() => toast.dismiss(toastId)}
          onAction={() => {
            if (action) run(commands[action.kind]);
          }}
        />
      ),
      {
        id: toastId,
        duration: Number.POSITIVE_INFINITY,
        onDismiss: () => {
          if (!replaced) setDismissedKey(key);
        },
      },
    );
    return () => {
      replaced = true;
    };
  }, [status, dismissedKey, pending, run]);

  useEffect(() => () => void toast.dismiss(toastId), []);
  return status?.state.status === "installing" ? (
    <UpdateRestartDialog version={status.state.version} />
  ) : null;
}
