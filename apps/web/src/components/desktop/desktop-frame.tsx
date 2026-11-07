import type {} from "@startup-os/contracts/desktop/window";

import { useEffect, useState, type ReactNode } from "react";

import { DesktopTitleBarContext } from "@/components/desktop/desktop-title-bar-content";
import { useTheme } from "@/components/theme/theme-provider";

export function DesktopFrame({ children }: { children: ReactNode }) {
  const bridge = window.startupOSWindow;
  const { resolvedTheme } = useTheme();
  const [fullscreen, setFullscreen] = useState(false);
  const [titleBarTarget, setTitleBarTarget] = useState<HTMLDivElement | null>(null);

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
    <DesktopTitleBarContext value={titleBarTarget}>
      <div className="desktop-frame" data-platform={bridge.platform} data-fullscreen={fullscreen}>
        <header className="desktop-title-bar" aria-label="Window title bar">
          <span className="desktop-title-bar-label">Startup OS</span>
          <div ref={setTitleBarTarget} className="desktop-title-bar-content" />
        </header>
        <div className="desktop-content">{children}</div>
      </div>
    </DesktopTitleBarContext>
  );
}
