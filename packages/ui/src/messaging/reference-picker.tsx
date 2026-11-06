import { useId, useState } from "react";
import { CircleCheck, FolderKanban, UserRound } from "lucide-react";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export type ReferenceKind = "task" | "project" | "person";

export function ReferencePicker({
  query,
  kind,
  results,
  loading = false,
  error,
  onQueryChange,
  onKindChange,
  onRetry,
  onInsert,
  onClose,
}: {
  query: string;
  kind: ReferenceKind;
  results: { id: string; title: string }[];
  loading?: boolean;
  error?: Error | null;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: ReferenceKind) => void;
  onRetry?: () => void;
  onInsert: (token: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const listId = useId();
  const available = loading || error ? [] : results;
  const selectedIndex = Math.min(index, Math.max(0, available.length - 1));
  const icons = { task: CircleCheck, project: FolderKanban, person: UserRound };
  const Icon = icons[kind];
  const insert = (id: string) => onInsert(`@[${kind}:${id}]`);
  return (
    <section aria-label="Insert workspace reference" className="space-y-3 border-t bg-card p-3">
      <div className="flex gap-2">
        {(["task", "project", "person"] as const).map((type) => (
          <Button
            key={type}
            type="button"
            size="xs"
            variant="outline"
            aria-pressed={kind === type}
            onClick={() => {
              onKindChange(type);
              setIndex(0);
            }}
          >
            {type === "person" ? "People" : `${type[0]!.toUpperCase()}${type.slice(1)}s`}
          </Button>
        ))}
      </div>
      <Input
        aria-label="Search references"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setIndex(0);
        }}
        role="combobox"
        aria-expanded={true}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          available[selectedIndex] ? `${listId}-${available[selectedIndex]!.id}` : undefined
        }
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex(Math.min(selectedIndex + 1, Math.max(0, available.length - 1)));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex(Math.max(0, selectedIndex - 1));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            const selected = available.at(selectedIndex);
            if (selected) insert(selected.id);
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        References do not grant access. People mentions notify conversation members.
      </p>
      {loading && <LoadingState label="Searching references" variant="compact" />}
      {error && <ErrorState compact title="Couldn’t search references" onRetry={onRetry} />}
      {!loading && !error && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No accessible references found.</p>
      )}
      <div id={listId} role="listbox" aria-label="References" className="max-h-48 overflow-auto">
        {available.map((item, itemIndex) => (
          <Button
            id={`${listId}-${item.id}`}
            key={item.id}
            type="button"
            role="option"
            aria-selected={selectedIndex === itemIndex}
              variant={selectedIndex === itemIndex ? "secondary" : "ghost"}
              className="w-full justify-start"
            onClick={() => insert(item.id)}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{item.title}</span>
          </Button>
        ))}
      </div>
      <Button type="button" size="xs" variant="ghost" onClick={onClose}>
        Close references
      </Button>
    </section>
  );
}
