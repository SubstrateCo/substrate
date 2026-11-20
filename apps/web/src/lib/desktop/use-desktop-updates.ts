import type {
  DesktopUpdatesAPI,
  DesktopUpdateStatus,
} from "@substrate/contracts/desktop/updates-ipc";

import { useEffect, useState } from "react";

/** The main process owns update status and pushes every change, so read it once and then listen. */
export function useDesktopUpdates(bridge: DesktopUpdatesAPI) {
  const [status, setStatus] = useState<DesktopUpdateStatus>();
  useEffect(() => {
    let active = true;
    const stop = bridge.onChange((next) => {
      if (active) setStatus(next);
    });
    bridge
      .get()
      // A change that arrived while this read was in flight is newer.
      .then((initial) => {
        if (active) setStatus((current) => current ?? initial);
      })
      .catch(() => {});
    return () => {
      active = false;
      stop();
    };
  }, [bridge]);
  return status;
}
