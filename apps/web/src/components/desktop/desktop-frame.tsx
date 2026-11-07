import type {} from "@startup-os/contracts/desktop/window";

import { useEffect, useState, type ReactNode } from "react";

import { useTheme } from "@/components/theme/theme-provider";

export function DesktopFrame({ children }: { children: ReactNode }) {
  const bridge = window.startupOSWindow;
  const { resolvedTheme } = useTheme();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    const unsubscribe = bridge.onFullscreenChange(setFullscreen);
    void bridge.isFullscreen().then((value) => {
      if (active) setFullscreen(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    const sync = () => {
      void bridge.setTheme(resolvedTheme);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [bridge, resolvedTheme]);

  if (!bridge) return children;
  return (
    <div className="desktop-frame" data-platform={bridge.platform} data-fullscreen={fullscreen}>
      <header className="desktop-title-bar" aria-label="Window title bar">
        <span>Startup OS</span>
      </header>
      <div className="desktop-content">{children}</div>
    </div>
  );
}
