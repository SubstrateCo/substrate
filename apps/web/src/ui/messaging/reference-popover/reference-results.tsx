import { useEffect, useRef } from "react";
import { ReferenceSuggestion as ReferenceSuggestionOption } from "@/ui/messaging/reference-suggestion";
import { LoadingState } from "@/ui/feedback/loading-state";
import { ErrorState } from "@/ui/feedback/error-state";
import type { ReferenceKind } from "@/ui/messaging/reference-picker";

export type ReferenceSuggestion = {
  id: string;
  kind: ReferenceKind;
  title: string;
  description?: string;
};

export const referenceOptionId = (listId: string, item: ReferenceSuggestion) =>
  `${listId}-${item.kind}-${item.id}`;

export function ReferenceResults({
  open,
  listId,
  query,
  results,
  selectedIndex,
  onHighlight,
  onSelect,
  loading,
  error,
  onRetry,
}: {
  open: boolean;
  listId: string;
  query: string;
  results: ReferenceSuggestion[];
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (item: ReferenceSuggestion) => void;
  loading: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open]);
  const available = loading ? [] : results;
  return (
    <div className="min-h-0 overflow-y-auto p-1">
      {loading && <LoadingState label="Searching references" variant="compact" rows={3} />}
      {error && <ErrorState compact title="Couldn’t search references" onRetry={onRetry} />}
      {!loading && !error && results.length === 0 && (
        <div role="status" className="px-3 py-7 text-center">
          <p className="text-sm font-medium">No matching references</p>
          <p className="mt-1 text-xs text-muted-foreground">Try another name or switch the type.</p>
        </div>
      )}
      {available.length > 0 && (
        <p className="px-2 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {query ? "Matches" : "Suggested"}
        </p>
      )}
      <div
        ref={list}
        id={listId}
        role="listbox"
        aria-label="References"
        aria-busy={loading}
        className="max-h-60 overflow-y-auto"
      >
        {available.map((item, index) => (
          <ReferenceSuggestionOption
            key={`${item.kind}:${item.id}`}
            item={item}
            id={referenceOptionId(listId, item)}
            selected={index === selectedIndex}
            onHighlight={() => onHighlight(index)}
            onSelect={() => onSelect(item)}
          />
        ))}
      </div>
    </div>
  );
}
