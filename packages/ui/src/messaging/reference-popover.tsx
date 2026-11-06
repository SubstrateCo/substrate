import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { AtSign } from "lucide-react";
import { ReferenceSuggestion as ReferenceSuggestionOption } from "./reference-suggestion";
import { Button } from "../primitives/button";
import { Popover, PopoverAnchor, PopoverContent } from "../primitives/popover";
import { LoadingState } from "../feedback/loading-state";
import { ErrorState } from "../feedback/error-state";
import type { ReferenceKind } from "./reference-picker";

export type ReferenceSuggestion = {
  id: string;
  kind: ReferenceKind;
  title: string;
  description?: string;
};

export const referenceOptionId = (listId: string, item: ReferenceSuggestion) =>
  `${listId}-${item.kind}-${item.id}`;

export function ReferencePopover({
  children,
  open,
  onOpenChange,
  listId,
  kind,
  query,
  results,
  selectedIndex,
  onHighlight,
  onKindChange,
  onSelect,
  loading = false,
  error,
  onRetry,
}: {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  kind: ReferenceKind | "all";
  query: string;
  results: ReferenceSuggestion[];
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onKindChange: (kind: ReferenceKind | "all") => void;
  onSelect: (item: ReferenceSuggestion) => void;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open]);
  const available = loading ? [] : results;
  const kinds = ["all", "person", "task", "project"] as const;
  const switchType = (event: KeyboardEvent<HTMLElement>) => {
    if (
      !open ||
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    onKindChange(kinds[(kinds.indexOf(kind) + direction + kinds.length) % kinds.length]!);
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor ref={anchor} onKeyDownCapture={switchType} asChild>
        {children}
      </PopoverAnchor>
      <PopoverContent
        variant="reference"
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        aria-label="Insert workspace reference"
        className="flex max-h-(--radix-popover-content-available-height) flex-col overflow-hidden"
        onKeyDownCapture={switchType}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (event.target instanceof Node && anchor.current?.contains(event.target)) {
            event.preventDefault();
          }
        }}
      >
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 text-sm font-medium">
          <AtSign className="size-4 text-muted-foreground" aria-hidden="true" />
          References
          <span className="ml-auto min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground">
            {kind === "all" ? "@" : `@${kind === "person" ? "user" : kind}:`}
            {query}
          </span>
        </div>
        <div role="group" aria-label="Reference type" className="flex gap-1 border-b px-2 pb-2">
          {kinds.map((type) => (
            <Button
              key={type}
              type="button"
              size="xs"
              variant={kind === type ? "secondary" : "ghost"}
              aria-pressed={kind === type}
              onClick={() => onKindChange(type)}
            >
              {{ all: "All", person: "Users", task: "Tasks", project: "Projects" }[type]}
            </Button>
          ))}
        </div>
        <div className="min-h-0 overflow-y-auto p-1">
          {loading && <LoadingState label="Searching references" variant="compact" rows={3} />}
          {error && <ErrorState compact title="Couldn’t search references" onRetry={onRetry} />}
          {!loading && !error && results.length === 0 && (
            <div role="status" className="px-3 py-7 text-center">
              <p className="text-sm font-medium">No matching references</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try another name or switch the type.
              </p>
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
      </PopoverContent>
    </Popover>
  );
}
