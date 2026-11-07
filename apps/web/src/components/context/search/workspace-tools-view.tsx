import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Command, CommandInput } from "../../ui/command";
import { Kbd, KbdGroup } from "../../ui/kbd";

export function WorkspaceTools({
  renderSearch,
  locationKey,
}: {
  locationKey: string;
  renderSearch: (
    query: string,
    onQueryChange: (query: string) => void,
    focusInput: () => void,
  ) => ReactNode;
}) {
  const [panel, setPanel] = useState({ locationKey, open: false });
  const open = panel.locationKey === locationKey && panel.open;
  if (panel.locationKey !== locationKey) setPanel({ locationKey, open: false });
  const setOpen = useCallback(
    (value: boolean) => setPanel({ locationKey, open: value }),
    [locationKey],
  );
  const [query, setQuery] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const desktop = !!window.startupOSWindow;
  const isMac = window.startupOSWindow?.platform === "darwin";
  const focusInput = useCallback(() => setFocusRequest((value) => value + 1), []);
  const close = useCallback(() => {
    setOpen(false);
    setFocusRequest((value) => value + 1);
  }, [setOpen]);
  useEffect(() => {
    if (focusRequest) input.current?.focus();
  }, [focusRequest]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [setOpen]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape" && open && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [close, open, setOpen]);
  return (
    <div
      ref={container}
      data-workspace-search
      onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest("a[href]")) setOpen(false);
      }}
      className={
        desktop
          ? "relative z-10 min-w-0 text-sm font-normal text-foreground [&_[data-slot=command-input-wrapper]]:h-7 [&_[data-slot=command-input-wrapper]]:rounded-md [&_[data-slot=command-input-wrapper]]:border-border/60 [&_[data-slot=command-input-wrapper]]:bg-muted/40 [&_[data-slot=command-input-wrapper]]:px-2 [&_[data-slot=command-input-wrapper]]:shadow-none [&_[data-slot=command-input]]:text-xs"
          : "relative z-10 shrink-0 border-b bg-sidebar px-4 py-2 text-sm font-normal text-foreground"
      }
    >
      <div className="relative mx-auto max-w-2xl">
        <Command shouldFilter={false} label="Search workspace">
          <CommandInput
            ref={input}
            aria-label="Search workspace"
            placeholder="Search workspace…"
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
            <KbdGroup
              className={desktop ? "max-sm:hidden" : undefined}
              aria-label={isMac ? "Command K" : "Control K"}
            >
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </CommandInput>
          {open && (
            <div
              data-workspace-search-results
              className={
                desktop
                  ? "absolute top-full left-1/2 mt-2 -translate-x-1/2 overflow-hidden rounded-xl border bg-popover shadow-xl max-[400px]:fixed max-[400px]:top-(--desktop-title-bar-height)"
                  : "absolute inset-x-0 top-full mt-2 overflow-hidden rounded-xl border bg-popover shadow-xl"
              }
              style={desktop ? { width: "min(32rem, calc(100vw - 24px))" } : undefined}
            >
              {renderSearch(query, setQuery, focusInput)}
            </div>
          )}
        </Command>
      </div>
    </div>
  );
}
