import { useHotkeys } from "@tanstack/react-hotkeys";

import { useLayoutEffect, useRef, useState } from "react";

import { Kbd } from "../../ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import type { SearchResultItem } from "./search-result";
import { SearchResults } from "@/components/context/search/search-results";

// "channel" lists channels only, with membership. DMs and group messages appear under "all".
export type SearchKind = "all" | "task" | "project" | "message" | "channel";

const defaultKinds = ["all", "task", "project", "message", "channel"] as const;
const kindLabels = {
  all: "All",
  task: "Tasks",
  project: "Projects",
  message: "Messages",
  channel: "Channels",
} satisfies Record<SearchKind, string>;

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex gap-0.5">
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </span>
      {label}
    </span>
  );
}

export function WorkspaceSearch({
  query,
  kind,
  kinds = defaultKinds,
  results,
  loading,
  error,
  hasMore,
  loadingMore,
  joiningId,
  onKindChange,
  onJoin,
  onMore,
  onRetry,
}: {
  query: string;
  kind: SearchKind;
  kinds?: readonly SearchKind[];
  results: SearchResultItem[];
  loading: boolean;
  error?: Error | null;
  hasMore: boolean;
  loadingMore: boolean;
  joiningId?: string;
  onKindChange: (kind: SearchKind) => void;
  onJoin: (conversationId: string) => void;
  onMore: () => void;
  onRetry: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [panelTop, setPanelTop] = useState(0);
  const isMac = desktopPlatform() === "darwin";
  useLayoutEffect(() => {
    const measure = () => setPanelTop(panel.current?.getBoundingClientRect().top ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  // The search input sits outside this panel, in the same search container, so the type
  // shortcuts listen on that container.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setContainer(panel.current?.closest<HTMLElement>("[data-workspace-search]") ?? null);
  }, []);
  const switchKind = (step: number) =>
    onKindChange(kinds[(kinds.indexOf(kind) + step + kinds.length) % kinds.length]!);
  useHotkeys(
    [
      { hotkey: "Control+Tab", callback: () => switchKind(1) },
      { hotkey: "Control+Shift+Tab", callback: () => switchKind(-1) },
    ],
    { target: container },
  );
  return (
    <section
      ref={panel}
      aria-label="Workspace search"
      className="flex max-h-(--panel-max-height) min-h-0 min-w-0 flex-col overflow-hidden bg-popover"
      // The panel's measured top is known only at run time.
      style={{ "--panel-max-height": `calc(100dvh - ${panelTop}px - var(--spacing) * 2)` }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          event.target instanceof HTMLElement &&
          event.target.closest("button, a")
        )
          event.stopPropagation();
      }}
    >
      <Tabs
        value={kind}
        onValueChange={(value) => {
          const next = kinds.find((type) => type === value);
          if (next) onKindChange(next);
        }}
        className="min-h-0"
      >
        <div className="shrink-0 border-b p-2">
          <TabsList aria-label="Search type" aria-keyshortcuts="Control+Tab">
            {kinds.map((type) => (
              <TabsTrigger key={type} value={type} className="flex-none">
                {kindLabels[type]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value={kind} className="flex min-h-0 flex-col">
          <SearchResults
            query={query}
            browsing={kind === "channel" && !query.trim()}
            filtered={kind !== "all"}
            joiningId={joiningId}
            onJoin={onJoin}
            results={results}
            loading={loading}
            error={error}
            onRetry={onRetry}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onMore={onMore}
          />
        </TabsContent>
      </Tabs>
      <footer
        aria-hidden="true"
        className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground"
      >
        {results.length > 0 && (
          <>
            <span className="tabular-nums">
              {results.length}
              {hasMore ? "+" : ""} {results.length === 1 && !hasMore ? "result" : "results"}
            </span>
            <Hint keys={["↑", "↓"]} label="Navigate" /> <Hint keys={["↵"]} label="Open" />
          </>
        )}
        <Hint keys={[isMac ? "⌃" : "Ctrl", "Tab"]} label="Switch type" />
        <span className="ml-auto">
          <Hint keys={["Esc"]} label="Close" />
        </span>
      </footer>
    </section>
  );
}
import { desktopPlatform } from "@/lib/desktop/bridges";
