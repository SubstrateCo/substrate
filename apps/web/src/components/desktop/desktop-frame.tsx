import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { DesktopTitleBarContext } from "@/components/desktop/desktop-title-bar-context";
import { useTheme } from "@/components/theme/theme-context";
import { windowBridge } from "@/lib/desktop/bridges";
import { desktop } from "@/lib/desktop/identity";

export function DesktopFrame({ children }: { children: ReactNode }) {
  const bridge = windowBridge();
  const { theme } = useTheme();
  const [fullscreen, setFullscreen] = useState(false);
  const [titleBarTarget, setTitleBarTarget] = useState<HTMLDivElement | null>(null);
  const [titleBarEnd, setTitleBarEnd] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!bridge) return;
    const controller = new AbortController();
    const unsubscribe = bridge.onFullscreenChange(setFullscreen);
    void bridge.isFullscreen().then((value) => {
      if (!controller.signal.aborted) setFullscreen(value);
    });
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    const sync = () => {
      void bridge.setTheme(theme);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [bridge, theme]);

  if (!bridge) return children;
  const frameStyle: CSSProperties & Record<`--${string}`, string> = {
    "--app-height": "calc(100dvh - var(--desktop-title-bar-height))",
  };
  const titleBarStyle: CSSProperties & Record<`--${string}`, string> = {
    "--desktop-controls-left":
      bridge.platform === "darwin" && !fullscreen ? "88px" : "env(titlebar-area-x, 0px)",
    "--desktop-controls-right":
      "calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))",
  };
  return (
    <DesktopTitleBarContext value={{ center: titleBarTarget, end: titleBarEnd }}>
      <div
        data-desktop-frame
        data-platform={bridge.platform}
        data-fullscreen={fullscreen}
        className="h-dvh overflow-hidden"
        style={frameStyle}
      >
        <header
          className="desktop-title-bar group/desktop-title-bar fixed inset-x-0 top-0 z-30 flex h-(--desktop-title-bar-height) items-center justify-center bg-rail px-(--desktop-controls-padding) text-xs font-medium text-rail-foreground select-none max-[400px]:pr-(--desktop-controls-right) max-[400px]:pl-(--desktop-controls-left)"
          style={titleBarStyle}
          aria-label="Window title bar"
        >
          <span className="truncate group-has-data-workspace-search/desktop-title-bar:hidden">
            {desktop.name}
          </span>
          <div
            ref={setTitleBarTarget}
            className="desktop-title-bar-search absolute min-w-0 empty:hidden"
          />
          <div
            ref={setTitleBarEnd}
            className="absolute right-(--desktop-tools-right) empty:hidden"
          />
        </header>
        {/* Keep fixed auth screens and local overlays below the native controls. */}
        <div className="absolute inset-x-0 top-(--desktop-title-bar-height) bottom-0 overflow-auto contain-layout">
          {children}
        </div>
      </div>
    </DesktopTitleBarContext>
  );
}
