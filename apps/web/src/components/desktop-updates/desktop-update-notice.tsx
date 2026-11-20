import type {
  DesktopUpdatesAPI,
  DesktopUpdateStatus,
} from "@substrate/contracts/desktop/updates-ipc";

import { useEffect, useRef } from "react";

import { updateNoticeContent, type UpdateNoticeAction } from "./update-notice-content";
import { UpdateToast } from "./update-toast";
import { updatesBridge } from "@/lib/desktop/bridges";
import { useDesktopUpdates } from "@/lib/desktop/use-desktop-updates";
import { toast } from "sonner";

const toastId = "desktop-update";

// Only the desktop app has this bridge. Browsers show nothing.
export function DesktopUpdateNotice() {
  const bridge = updatesBridge();
  if (!bridge) return null;
  return <UpdateNoticeToast bridge={bridge} />;
}

/** Shows the update that needs the person as one toast, updated in place as the status changes. */
function UpdateNoticeToast({ bridge }: { bridge: DesktopUpdatesAPI }) {
  const status = useDesktopUpdates(bridge);
  // The notice the person closed stays hidden until the update means something new.
  const dismissed = useRef<string>(undefined);
  // Sonner reports programmatic dismissals too. Only the person's own close counts.
  const hiding = useRef<string>(undefined);
  const shown = useRef<string>(undefined);

  useEffect(() => {
    const content = status && updateNoticeContent(status);
    if (!content || content.key === dismissed.current) {
      hiding.current = shown.current;
      shown.current = undefined;
      toast.dismiss(toastId);
      return;
    }
    const run: Record<UpdateNoticeAction, () => Promise<DesktopUpdateStatus | void>> = {
      install: () => bridge.installNow(),
      download: () => bridge.openDownloadPage(),
      retry: () => bridge.checkForUpdates(),
    };
    const { key, action } = content;
    shown.current = key;
    hiding.current = undefined;
    toast.custom(
      () => (
        <UpdateToast
          content={content}
          onClose={() => toast.dismiss(toastId)}
          onAction={() => {
            if (!action) return;
            void run[action.kind]().catch(() => {
              toast.error("We couldn't finish the update. Try again.");
            });
          }}
        />
      ),
      {
        id: toastId,
        duration: Number.POSITIVE_INFINITY,
        onDismiss: () => {
          if (hiding.current === key) return;
          dismissed.current = key;
          shown.current = undefined;
        },
      },
    );
  }, [bridge, status]);

  useEffect(() => () => void toast.dismiss(toastId), []);
  return null;
}
