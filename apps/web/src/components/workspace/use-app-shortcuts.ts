import { useHotkeys } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";

import { workspaceApps } from "./workspace-apps";
import { appHotkeys } from "@/lib/hotkeys/app-hotkeys";

// Text fields, menus, and listboxes keep their keys through `ignoreInputs`. Open dialogs own the
// keyboard too, so a sequence typed inside one does not leave it.
function inDialog(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("[role=dialog], [role=alertdialog]");
}

/** Binds each rail app's shortcut to opening that app. */
export function useAppShortcuts() {
  const navigate = useNavigate();
  useHotkeys(
    workspaceApps.map((app) => ({
      hotkey: appHotkeys[app.hotkey],
      callback: (event: KeyboardEvent) => {
        if (inDialog(event.target)) return;
        void navigate({ to: app.to });
      },
    })),
    { ignoreDefaultPrevented: true },
  );
}
