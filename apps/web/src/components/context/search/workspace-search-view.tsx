import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "../../ui/button";
import type { SearchResultItem } from "./search-result";
import { SearchResults } from "@/components/context/search/workspace-search/search-results";
import { SearchShortcuts } from "@/components/context/search/workspace-search/search-shortcuts";

export type SearchKind = "all" | "task" | "project" | "message" | "conversation";

export function WorkspaceSearch({
  query,
  kind,
  related,
  results,
  loading,
  error,
  hasMore,
  loadingMore,
  onKindChange,
  onRelated,
  onClearRelated,
  onMore,
  onRetry,
  onFocusInput,
}: {
  query: string;
  kind: SearchKind;
  related: boolean;
  results: SearchResultItem[];
  loading: boolean;
  error?: Error | null;
  hasMore: boolean;
  loadingMore: boolean;
  onKindChange: (kind: SearchKind) => void;
  onRelated: (id: string) => void;
  onClearRelated: () => void;
  onMore: () => void;
  onRetry: () => void;
  onFocusInput: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [panelTop, setPanelTop] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setPanelTop(panel.current?.getBoundingClientRect().top ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return (
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
          onFocusInput();
        }}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onMore={onMore}
      />
      <SearchShortcuts />
    </section>
  );
}
