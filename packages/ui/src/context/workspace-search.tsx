import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, CornerDownLeft, X } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
} from "../primitives/command";
import { Kbd, KbdGroup } from "../primitives/kbd";
import { Button } from "../primitives/button";
import { LoadingState } from "../feedback/loading-state";
import { ErrorState } from "../feedback/error-state";
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
  hideInput = false,
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
  hideInput?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const visible = isAccessFailure(error) ? [] : results;
  const content = (
    <section
      aria-label="Workspace search"
      className="min-w-0 bg-popover"
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          event.target instanceof HTMLElement &&
          event.target.closest("button, a")
        )
          event.stopPropagation();
      }}
    >
      {!hideInput && (
        <div className="flex items-center gap-2 p-2">
          <CommandInput
            ref={input}
            aria-label="Search workspace"
            placeholder="Search your accessible work."
            value={query}
            onValueChange={onQueryChange}
          />
          <Button variant="ghost" size="icon-sm" aria-label="Close search" onClick={onClose}>
            <X />
          </Button>
        </div>
      )}
      {related && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <span className="text-sm text-muted-foreground">Related records</span>
          <Button variant="ghost" size="xs" onClick={onClearRelated}>
            Search all records
          </Button>
        </div>
      )}
      <div
        role="group"
        aria-label="Search type"
        className="flex flex-wrap gap-1 border-b px-2 py-2"
      >
        {(["all", "task", "project", "message", "conversation"] as const).map((type) => (
          <Button
            key={type}
            size="xs"
            variant={kind === type ? "secondary" : "ghost"}
            aria-pressed={kind === type}
            onClick={() => onKindChange(type)}
          >
            {
              {
                all: "All",
                task: "Tasks",
                project: "Projects",
                message: "Messages",
                conversation: "Channels",
              }[type]
            }
          </Button>
        ))}
      </div>
      <CommandList aria-label="Search results">
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
              <SearchResult
                key={item.id}
                item={item}
                onRelated={() => {
                  onRelated(item.id);
                  input.current?.focus();
                }}
              />
            ))}
          </CommandGroup>
        )}
      </CommandList>
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <KbdGroup>
            <Kbd>
              <ArrowUp aria-label="Up" />
            </Kbd>
            <Kbd>
              <ArrowDown aria-label="Down" />
            </Kbd>
          </KbdGroup>{" "}
          to navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>
            <CornerDownLeft aria-label="Enter" />
          </Kbd>{" "}
          to open
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Kbd>Esc</Kbd> to close
        </span>
      </div>
    </section>
  );
  return hideInput ? (
    content
  ) : (
    <Command shouldFilter={false} label="Search workspace">
      {content}
    </Command>
  );
}
