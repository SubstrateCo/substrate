import { useHotkey } from "@tanstack/react-hotkeys";

import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import { useWorkspaceSearch } from "./workspace-search-context";
import { Command, CommandInput } from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { desktopPlatform } from "@/lib/desktop/bridges";
import { cn } from "cn";

export function WorkspaceTools({
  renderSearch,
  locationKey,
  openRequest,
}: {
  locationKey: string;
  /** A new value opens the panel with an empty query and focuses the input. */
  openRequest?: number;
  renderSearch: (query: string, onClose: () => void) => ReactNode;
}) {
  const [panel, setPanel] = useState({ locationKey, open: false });
  const { setLocalSearchTarget } = useWorkspaceSearch();
  const open = panel.locationKey === locationKey && panel.open;
  if (panel.locationKey !== locationKey) setPanel({ locationKey, open: false });
  const setOpen = useCallback(
    (value: boolean) => setPanel({ locationKey, open: value }),
    [locationKey],
  );
  const [query, setQuery] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);
  const [handledRequest, setHandledRequest] = useState(openRequest);
  if (openRequest !== handledRequest) {
    setHandledRequest(openRequest);
    setPanel({ locationKey, open: true });
    setQuery("");
    setFocusRequest((value) => value + 1);
  }
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const activationTimeout = useRef<number | undefined>(undefined);
  const desktop = !!desktopPlatform();
  const isMac = desktopPlatform() === "darwin";
  const close = useCallback(() => {
    setOpen(false);
    setFocusRequest((value) => value + 1);
  }, [setOpen]);
  useEffect(() => {
    if (focusRequest) {
      const local = container.current?.querySelector<HTMLButtonElement>(
        "[data-open-workspace-search]",
      );
      if (local?.offsetWidth) local.focus();
      else input.current?.focus();
    }
  }, [focusRequest]);
  const onPointerDown = useEffectEvent((event: PointerEvent) => {
    if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
  });
  const onResultClick = useEffectEvent((event: MouseEvent) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link || !results.current?.contains(link)) return;
    // Observe native link activation, including Enter and clicks stopped by a result.
    // Dismiss after the router handler and the browser's default action have had their turn.
    window.clearTimeout(activationTimeout.current);
    activationTimeout.current = window.setTimeout(() => setOpen(false));
  });
  useEffect(() => {
    const dismiss = (event: PointerEvent) => onPointerDown(event);
    const observeActivation = (event: MouseEvent) => onResultClick(event);
    const search = container.current;
    document.addEventListener("pointerdown", dismiss);
    search?.addEventListener("click", observeActivation, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      search?.removeEventListener("click", observeActivation, true);
      window.clearTimeout(activationTimeout.current);
    };
  }, []);
  useHotkey(
    "Mod+K",
    () => {
      setOpen(true);
      setFocusRequest((value) => value + 1);
    },
    { ignoreInputs: false },
  );
  useHotkey("Escape", close, {
    enabled: open,
    target: window,
    ignoreDefaultPrevented: true,
    ignoreInputs: false,
    preventDefault: true,
    stopPropagation: false,
  });
  return (
    <div
      ref={container}
      data-workspace-search
      className={cn(
        "group/search-host",
        desktop
          ? "relative z-10 min-w-0 text-sm font-normal text-foreground [&_[data-slot=command-input-wrapper]]:h-7 [&_[data-slot=command-input-wrapper]]:rounded-md [&_[data-slot=command-input-wrapper]]:border-rail-foreground/12 [&_[data-slot=command-input-wrapper]]:bg-surface/65 [&_[data-slot=command-input-wrapper]]:px-2 [&_[data-slot=command-input-wrapper]]:shadow-none dark:[&_[data-slot=command-input-wrapper]]:bg-popover [&_[data-slot=command-input]]:text-xs [&_[data-slot=command]]:bg-transparent"
          : "relative z-30 shrink-0 border-b bg-sidebar px-4 py-2 text-sm font-normal text-foreground",
      )}
    >
      <div ref={setLocalSearchTarget} hidden={open} className="empty:hidden" />
      <div
        className={cn(
          "relative mx-auto max-w-2xl",
          !open && "group-has-data-local-search/search-host:hidden",
        )}
      >
        <Command shouldFilter={false} label="Search workspace">
          <CommandInput
            ref={input}
            aria-label="Search workspace"
            placeholder="Search workspace"
            value={query}
            aria-expanded={open}
            onClick={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && open) {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
              if (event.key === "ArrowDown" || event.key === "Enter") setOpen(true);
            }}
            onValueChange={(value) => {
              setQuery(value);
              setOpen(true);
            }}
          >
            <KbdGroup className="max-sm:hidden" aria-label={isMac ? "Command K" : "Control K"}>
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </CommandInput>
          {open && (
            <div
              ref={results}
              data-workspace-search-results
              className={
                desktop
                  ? "absolute top-full left-1/2 mt-2 w-search-panel -translate-x-1/2 overflow-hidden rounded-xl border bg-popover shadow-floating max-[400px]:fixed max-[400px]:top-(--desktop-title-bar-height)"
                  : "absolute inset-x-0 top-full mt-2 overflow-hidden rounded-xl border bg-popover shadow-floating"
              }
            >
              {renderSearch(query, close)}
            </div>
          )}
        </Command>
      </div>
    </div>
  );
}
