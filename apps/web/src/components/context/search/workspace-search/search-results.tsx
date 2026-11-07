import { SearchResult, type SearchResultItem } from "@/components/context/search/search-result";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { CommandEmpty, CommandGroup, CommandList } from "@/components/ui/command";

export function SearchResults({
  query,
  results,
  loading,
  error,
  onRetry,
  onRelated,
  hasMore,
  loadingMore,
  onMore,
}: {
  query: string;
  results: SearchResultItem[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onRelated: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
  const visible = isAccessFailure(error) ? [] : results;
  return (
    <CommandList label="Search results" className="min-h-0">
      {loading && !visible.length && (
        <div className="p-3">
          <LoadingState label="Searching workspace" variant="compact" />
        </div>
      )}
      {error && (
        <div className="p-3">
          <ErrorState compact title="Couldn't search workspace" onRetry={onRetry} />
        </div>
      )}
      {!loading && !error && (
        <CommandEmpty>No accessible results found. Try another search.</CommandEmpty>
      )}
      {visible.length > 0 && (
        <CommandGroup heading={query ? "Results" : "Suggested for you"}>
          {visible.map((item) => (
            <SearchResult key={item.id} item={item} onRelated={() => onRelated(item.id)} />
          ))}
        </CommandGroup>
      )}
      {!isAccessFailure(error) && visible.length > 0 && (
        <div className="px-2 py-3 text-center">
          {hasMore ? (
            <PendingButton
              variant="ghost"
              size="sm"
              pending={loadingMore}
              pendingLabel="Loading results…"
              onClick={onMore}
            >
              Load more results
            </PendingButton>
          ) : (
            !loading && !error && <p className="text-xs text-muted-foreground">End of results</p>
          )}
        </div>
      )}
    </CommandList>
  );
}
