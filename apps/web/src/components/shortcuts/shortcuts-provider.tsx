import type { DesktopSettingsAPI } from "@substrate/contracts/desktop/window";

import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";

import { useMemo, type ReactNode } from "react";

import { appHotkeys } from "@/components/shortcuts/app-hotkeys";
import { desktopSettingsBridge } from "@/lib/desktop/bridges";
import { customFromSaved, savedFromCustom } from "@/lib/shortcuts/saved-shortcuts";
import { useShortcutsUpdate } from "@/queries/desktop/mutations";
import { desktopShortcutsQueryOptions } from "@/queries/desktop/settings";
import { toast } from "sonner";

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const bridge = desktopSettingsBridge();
  if (!bridge) return <HotkeysProvider appHotkeys={appHotkeys}>{children}</HotkeysProvider>;
  return <SavedShortcutsProvider bridge={bridge}>{children}</SavedShortcutsProvider>;
}

function SavedShortcutsProvider({
  bridge,
  children,
}: {
  bridge: DesktopSettingsAPI;
  children: ReactNode;
}) {
  const saved = useQuery(desktopShortcutsQueryOptions(bridge));
  const save = useShortcutsUpdate(bridge);
  const custom = useMemo(() => saved.data && customFromSaved(saved.data), [saved.data]);
  return (
    <HotkeysProvider
      appHotkeys={appHotkeys}
      customHotkeys={custom}
      onCustomHotkeysChange={(next) =>
        save.mutate(savedFromCustom(next), {
          onError: () =>
            toast.error("We couldn’t save your shortcut. It works until Substrate restarts."),
        })
      }
    >
      {children}
    </HotkeysProvider>
  );
}
