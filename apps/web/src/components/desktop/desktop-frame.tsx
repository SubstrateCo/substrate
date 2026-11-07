import type {} from "@startup-os/contracts/desktop/window";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import "./desktop-frame.css";
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
  const frameStyle: CSSProperties & Record<`--${string}`, string> = {
    "--app-height": "calc(100dvh - var(--desktop-title-bar-height))",
    "--desktop-title-bar-height": "max(40px, env(titlebar-area-height, 40px))",
  };
  const titleBarStyle: CSSProperties & Record<`--${string}`, string> = {
    "--desktop-controls-left":
      bridge.platform === "darwin" && !fullscreen ? "88px" : "env(titlebar-area-x, 0px)",
    "--desktop-controls-right":
      "calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))",
  };
  return (
    <DesktopTitleBarContext value={titleBarTarget}>
      <div
        data-desktop-frame
        data-platform={bridge.platform}
        data-fullscreen={fullscreen}
        className="h-dvh overflow-hidden"
        style={frameStyle}
      >
        <header
          className="desktop-title-bar group/desktop-title-bar fixed inset-x-0 top-0 z-30 flex h-(--desktop-title-bar-height) items-center justify-center bg-rail text-xs font-medium text-rail-foreground select-none"
          style={titleBarStyle}
          aria-label="Window title bar"
        >
          <span className="truncate group-has-data-workspace-search/desktop-title-bar:hidden">
            Startup OS
          </span>
          <div
            ref={setTitleBarTarget}
            className="desktop-title-bar-search absolute min-w-0 empty:hidden"
          />
        </header>
        {/* Keep fixed auth screens and local overlays below the native controls. */}
        <div
          className="absolute inset-x-0 top-(--desktop-title-bar-height) bottom-0 overflow-auto"
          style={{ contain: "layout" }}
        >
          {children}
        </div>
      </div>
    </DesktopTitleBarContext>
  );
}
