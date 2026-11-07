import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "../../ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "../../ui/popover";
import type { ReferenceKind } from "./reference-picker";
import {
  ReferenceResults,
  type ReferenceSuggestion,
} from "@/components/messaging/references/reference-popover/reference-results";
import { AtSign } from "lucide-react";

export {
  referenceOptionId,
  type ReferenceSuggestion,
} from "@/components/messaging/references/reference-popover/reference-results";

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
  const anchor = useRef<HTMLDivElement>(null);
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
        <ReferenceResults
          open={open}
          listId={listId}
          query={query}
          results={results}
          selectedIndex={selectedIndex}
          onHighlight={onHighlight}
          onSelect={onSelect}
          loading={loading}
          error={error}
          onRetry={onRetry}
        />
      </PopoverContent>
    </Popover>
  );
}
