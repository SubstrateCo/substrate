import { CommandEmpty, CommandGroup, CommandList } from "@/ui/primitives/command";
import { LoadingState } from "@/ui/feedback/loading-state";
import { ErrorState } from "@/ui/feedback/error-state";
import { isAccessFailure } from "@/ui/feedback/request-failure";
import { SearchResult, type SearchResultItem } from "@/ui/context/search-result";

export function SearchResults({
  query,
  results,
  loading,
  error,
  onRetry,
  onRelated,
}: {
  query: string;
  results: SearchResultItem[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onRelated: (id: string) => void;
}) {
  const visible = isAccessFailure(error) ? [] : results;
  return (
    <CommandList aria-label="Search results" className="min-h-0">
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
    </CommandList>
  );
}
