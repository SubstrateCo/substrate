import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Command, CommandInput } from "../../ui/command";
import { Kbd, KbdGroup } from "../../ui/kbd";

export function WorkspaceTools({
  renderSearch,
}: {
  renderSearch: (
    query: string,
    onQueryChange: (query: string) => void,
    focusInput: () => void,
  ) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const focusInput = useCallback(() => setFocusRequest((value) => value + 1), []);
  const close = useCallback(() => {
    setOpen(false);
    setFocusRequest((value) => value + 1);
  }, []);
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
  }, []);
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
  }, [close, open]);
  return (
    <div ref={container} className="relative z-10 shrink-0 border-b bg-sidebar px-4 py-2">
      <div className="relative mx-auto max-w-2xl">
        <Command shouldFilter={false} label="Search workspace">
          <CommandInput
            ref={input}
            aria-label="Search workspace"
            placeholder="Search messages, tasks, and projects"
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
            <KbdGroup aria-label="Control K">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </CommandInput>
          {open && (
            <div className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-xl border bg-popover shadow-xl">
              {renderSearch(query, setQuery, focusInput)}
            </div>
          )}
        </Command>
      </div>
    </div>
  );
}
