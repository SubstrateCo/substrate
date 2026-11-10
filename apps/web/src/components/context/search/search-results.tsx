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
  filtered,
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
  /** A type other than All is selected. */
  filtered: boolean;
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
  const trimmed = query.trim();
  let heading = trimmed ? "Results" : "Jump to";
  if (browsing) heading = "Browse channels";
  const errorState = <ErrorState compact title="Couldn’t search workspace" onRetry={onRetry} />;
  return (
    <CommandList label="Search results" className="max-h-96 min-h-0">
      {!visible.length && (
        // Loading, error, and empty states share one height, so the panel does not resize.
        <div className="flex h-36 flex-col justify-center px-3">
          {error && errorState}
          {!error && loading && (
            <LoadingState label="Searching workspace" variant="compact" rows={2} />
          )}
          {!error && !loading && (
            <div className="space-y-1 text-center text-sm">
              <p className="font-medium wrap-anywhere">
                {browsing && "No channels yet"}
                {!browsing && (trimmed ? `No results for “${trimmed}”` : "Nothing here yet")}
              </p>
              {!browsing && trimmed && (
                <p className="text-muted-foreground">
                  {filtered
                    ? "Try All to search every type."
                    : "Check the spelling or try fewer words."}
                </p>
              )}
            </div>
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
              <SearchResult key={item.id} item={item} query={trimmed} />
            ),
          )}
        </CommandGroup>
      )}
      {!isAccessFailure(error) && visible.length > 0 && hasMore && (
        <div className="px-2 pb-2 text-center">
          <PendingButton
            variant="ghost"
            size="sm"
            pending={loadingMore}
            pendingLabel="Loading results."
            onClick={onMore}
          >
            Show more
          </PendingButton>
        </div>
      )}
      {visible.length > 0 && (
        // A fade over the last 16px, so a row cut by the list's edge reads as "more below".
        <div
          aria-hidden="true"
          className="pointer-events-none sticky bottom-0 -mt-4 h-4 bg-linear-to-t from-popover to-transparent"
        />
      )}
    </CommandList>
  );
}
