import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import type { SearchResultItem } from "./search-result";
import { SearchResults } from "@/components/context/search/search-results";

// "channel" lists channels only, with membership. DMs and group messages appear under "all".
export type SearchKind = "all" | "task" | "project" | "message" | "channel";

const kinds = ["all", "task", "project", "message", "channel"] as const;
const kindLabels = {
  all: "All",
  task: "Tasks",
  project: "Projects",
  message: "Messages",
  channel: "Channels",
} satisfies Record<SearchKind, string>;

// Left and Right switch tabs. In the search input they do so only when the caret is
// already at that edge of the text, so normal caret movement keeps working.
// A focused tab handles the arrow keys itself.
function tabStep(event: KeyboardEvent) {
  if ([event.altKey, event.ctrlKey, event.metaKey, event.shiftKey].some(Boolean)) return 0;
  if (event.target instanceof Element && event.target.closest("[role=tablist]")) return 0;
  const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key] ?? 0;
  const target = event.target;
  if (!step || !(target instanceof HTMLInputElement)) return step;
  const edge = step < 0 ? 0 : target.value.length;
  return target.selectionStart === edge && target.selectionEnd === edge ? step : 0;
}

export function WorkspaceSearch({
  query,
  kind,
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
  useLayoutEffect(() => {
    const measure = () => setPanelTop(panel.current?.getBoundingClientRect().top ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      // The search input sits outside this panel, in the same search container.
      const container = panel.current?.closest("[data-workspace-search]");
      if (!(event.target instanceof Node) || !container?.contains(event.target)) return;
      const step = tabStep(event);
      if (!step) return;
      event.preventDefault();
      onKindChange(kinds[(kinds.indexOf(kind) + step + kinds.length) % kinds.length]!);
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [kind, onKindChange]);
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
      <Tabs
        value={kind}
        onValueChange={(value) => {
          const next = kinds.find((type) => type === value);
          if (next) onKindChange(next);
        }}
        className="min-h-0"
      >
        <div className="shrink-0 px-2 pt-1.5">
          <TabsList variant="line" aria-label="Search type">
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
    </section>
  );
}
