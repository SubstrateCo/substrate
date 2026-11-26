import { isOptionalApp } from "@substrate/contracts/apps";

import { useHotkeys } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";

import { useOrganizationApps } from "./organization-apps-context";
import { notificationsApp, workspaceApps } from "./workspace-apps";

// Text fields, menus, and listboxes keep their keys through `ignoreInputs`. Open dialogs own the
// keyboard too, so a sequence typed inside one does not leave it.
function inDialog(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("[role=dialog], [role=alertdialog]");
}

/** Binds each rail app's shortcut to opening that app. */
export function useAppShortcuts() {
  const navigate = useNavigate();
  const apps = useOrganizationApps();
  useHotkeys(
    [...workspaceApps, notificationsApp].map((app) => ({
      hotkey: app.hotkey,
      callback: (event: KeyboardEvent) => {
        if (inDialog(event.target)) return;
        if ("id" in app && isOptionalApp(app.id) && !apps.enabled(app.id)) return;
        void navigate({ to: app.to });
      },
    })),
    { ignoreDefaultPrevented: true },
  );
}
