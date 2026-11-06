import { useEffect, useRef } from "react";
import { Input } from "../primitives/input";
import { Button } from "../primitives/button";
import { LoadingState } from "../feedback/loading-state";
import { ErrorState } from "../feedback/error-state";
import { ContentNotice } from "../feedback/content-notice";
import { isAccessFailure } from "../feedback/request-failure";
import { SearchResult, type SearchResultItem } from "./search-result";

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
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const visible = isAccessFailure(error) ? [] : results;
  return (
    <section
      aria-label="Workspace search"
      className="max-h-96 space-y-3 overflow-auto border-b bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <Input
          ref={input}
          type="search"
          aria-label="Search workspace"
          placeholder="Search your accessible work."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <Button variant="ghost" onClick={onClose}>
          Close search
        </Button>
      </div>
      {related && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Related records</span>
          <Button variant="ghost" size="xs" onClick={onClearRelated}>
            Search all records
          </Button>
        </div>
      )}
      <div role="group" aria-label="Search type" className="flex flex-wrap gap-2">
        {(["all", "task", "project", "message", "conversation"] as const).map((type) => (
          <Button
            key={type}
            size="xs"
            variant="outline"
            aria-pressed={kind === type}
            onClick={() => onKindChange(type)}
          >
            {type}
          </Button>
        ))}
      </div>
      {loading && !visible.length && <LoadingState label="Searching workspace" variant="compact" />}
      {error && <ErrorState compact title="Couldn't search workspace" onRetry={onRetry} />}
      {!loading && !error && !visible.length && (
        <ContentNotice
          title="No accessible results found"
          description="Try another search or record type."
        />
      )}
      <ul className="space-y-2">
        {visible.map((item) => (
          <SearchResult
            key={item.id}
            item={item}
            onRelated={() => {
              onRelated(item.id);
              input.current?.focus();
            }}
          />
        ))}
      </ul>
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
    </section>
  );
}
