import { ChannelSearchResult } from "@/components/context/search/channel-search-result";
import { SearchResult, type SearchResultItem } from "@/components/context/search/search-result";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { CommandGroup, CommandList } from "@/components/ui/command";

export function SearchResults({
  query,
  browsing,
  joiningId,
  onJoin,
  results,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onMore,
}: {
  query: string;
  browsing: boolean;
  joiningId?: string;
  onJoin: (conversationId: string) => void;
  results: SearchResultItem[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
  const visible = isAccessFailure(error) ? [] : results;
  // A type label helps only when the list mixes record types.
  const mixed = new Set(visible.map((item) => item.kind)).size > 1;
  let heading = query ? "Results" : "Suggested for you";
  if (browsing) heading = "Browse channels";
  const errorState = <ErrorState compact title="Couldn't search workspace" onRetry={onRetry} />;
  return (
    <CommandList label="Search results" className="min-h-0">
      {!visible.length && (
        // Loading, error, and empty states share one height, so the panel does not resize.
        <div className="flex h-36 flex-col justify-center px-3">
          {error && errorState}
          {!error && loading && (
            <LoadingState label="Searching workspace" variant="compact" rows={2} />
          )}
          {!error && !loading && (
            <p className="text-center text-sm text-muted-foreground">
              {browsing ? "No channels yet." : "No accessible results found. Try another search."}
            </p>
          )}
        </div>
      )}
      {visible.length > 0 && error && <div className="px-3">{errorState}</div>}
      {visible.length > 0 && (
        <CommandGroup heading={heading}>
          {visible.map((item) =>
            item.kind === "channel" ? (
              <ChannelSearchResult
                key={item.id}
                item={item}
                joining={joiningId === item.id}
                onJoin={() => onJoin(item.id)}
              />
            ) : (
              <SearchResult key={item.id} item={item} showKind={mixed} />
            ),
          )}
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
