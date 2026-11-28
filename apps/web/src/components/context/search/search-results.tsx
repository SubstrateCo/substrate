import { ChannelSearchResult } from "@/components/context/search/channel-search-result";
import {
  SearchResult,
  SearchResultLoading,
  type SearchResultItem,
} from "@/components/context/search/search-result";
import { ErrorState } from "@/components/feedback/error-state";
import { PendingButton } from "@/components/feedback/pending-button";
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
  const trimmed = query.trim();
  let heading = trimmed ? "Results" : "Jump to";
  if (browsing) heading = "Browse channels";
  const errorState = (
    <ErrorState variant="compact" title="Couldn’t search workspace" onRetry={onRetry} />
  );
  if (loading && results.length === 0 && !error) {
    return (
      <CommandList label="Search results" className="max-h-96 min-h-0">
        <CommandGroup heading={heading}>
          <SearchResultLoading browsing={browsing} />
        </CommandGroup>
      </CommandList>
    );
  }
  if (results.length === 0) {
    let notice = <NoSearchResults query={trimmed} browsing={browsing} filtered={filtered} />;
    if (error) notice = errorState;
    return (
      <CommandList label="Search results" className="max-h-96 min-h-0">
        <div className="flex h-36 flex-col justify-center px-3">{notice}</div>
      </CommandList>
    );
  }
  return (
    <CommandList label="Search results" className="max-h-96 min-h-0">
      {error && <div className="px-3">{errorState}</div>}
      <CommandGroup heading={heading}>
        {results.map((item) =>
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
      {hasMore && (
        <div className="px-2 pb-2 text-center">
          <PendingButton variant="ghost" size="sm" pending={loadingMore} onClick={onMore}>
            Show more
          </PendingButton>
        </div>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none sticky bottom-0 -mt-4 h-4 bg-linear-to-t from-popover to-transparent"
      />
    </CommandList>
  );
}

function NoSearchResults({
  query,
  browsing,
  filtered,
}: {
  query: string;
  browsing: boolean;
  filtered: boolean;
}) {
  let title = query ? `No results for “${query}”` : "Nothing here yet";
  if (browsing) title = "No channels yet";
  return (
    <div className="space-y-1 text-center text-sm">
      <p className="font-medium wrap-anywhere">{title}</p>
      {!browsing && query && (
        <p className="text-muted-foreground">
          {filtered ? "Try All to search every type." : "Check the spelling or try fewer words."}
        </p>
      )}
    </div>
  );
}
