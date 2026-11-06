import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { isAccessFailure } from "../feedback/request-failure";
import { Button } from "../primitives/button";
import { Command, CommandInput } from "../primitives/command";
import type { SearchResultItem } from "./search-result";
import { SearchResults } from "@/ui/context/workspace-search/search-results";
import { SearchShortcuts } from "@/ui/context/workspace-search/search-shortcuts";
import { X } from "lucide-react";

export type SearchKind = "all" | "task" | "project" | "message" | "conversation";

export function WorkspaceSearch({
  query,
  kind,
  related,
  results,
  loading,
  error,
  hasMore,
  hasPrevious,
  onQueryChange,
  onKindChange,
  onRelated,
  onClearRelated,
  onMore,
  onFirst,
  onRetry,
  onClose,
  onFocusInput,
  hideInput = false,
}: {
  query: string;
  kind: SearchKind;
  related: boolean;
  results: SearchResultItem[];
  loading: boolean;
  error?: Error | null;
  hasMore: boolean;
  hasPrevious: boolean;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: SearchKind) => void;
  onRelated: (id: string) => void;
  onClearRelated: () => void;
  onMore: () => void;
  onFirst: () => void;
  onRetry: () => void;
  onClose: () => void;
  onFocusInput?: () => void;
  hideInput?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [panelTop, setPanelTop] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setPanelTop(panel.current?.getBoundingClientRect().top ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const content = (
    <section
      ref={panel}
      aria-label="Workspace search"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-popover"
      style={{ maxHeight: `calc(100dvh - ${panelTop}px - var(--spacing) * 2)` }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          event.target instanceof HTMLElement &&
          event.target.closest("button, a")
        )
          event.stopPropagation();
      }}
    >
      {!hideInput && (
        <div className="flex shrink-0 items-center gap-2 p-2">
          <CommandInput
            ref={input}
            aria-label="Search workspace"
            placeholder="Search your accessible work."
            value={query}
            onValueChange={onQueryChange}
          />
          <Button variant="ghost" size="icon-sm" aria-label="Close search" onClick={onClose}>
            <X />
          </Button>
        </div>
      )}
      {related && (
        <div className="flex shrink-0 items-center gap-2 px-3 pt-2">
          <span className="text-sm text-muted-foreground">Related records</span>
          <Button variant="ghost" size="xs" onClick={onClearRelated}>
            Search all records
          </Button>
        </div>
      )}
      <div
        role="group"
        aria-label="Search type"
        className="flex shrink-0 flex-wrap gap-1 border-b px-2 py-2"
      >
        {(["all", "task", "project", "message", "conversation"] as const).map((type) => (
          <Button
            key={type}
            size="xs"
            variant={kind === type ? "secondary" : "ghost"}
            aria-pressed={kind === type}
            onClick={() => onKindChange(type)}
          >
            {
              {
                all: "All",
                task: "Tasks",
                project: "Projects",
                message: "Messages",
                conversation: "Channels",
              }[type]
            }
          </Button>
        ))}
      </div>
      <SearchResults
        query={query}
        results={results}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onRelated={(id) => {
          onRelated(id);
          if (hideInput) onFocusInput?.();
          else input.current?.focus();
        }}
      />
      {!isAccessFailure(error) && hasMore && (
        <Button variant="outline" onClick={onMore}>
          More results
        </Button>
      )}
      {hasPrevious && (
        <Button variant="ghost" onClick={onFirst}>
          First results
        </Button>
      )}
      <SearchShortcuts />
    </section>
  );
  return hideInput ? (
    content
  ) : (
    <Command shouldFilter={false} label="Search workspace">
      {content}
    </Command>
  );
}
