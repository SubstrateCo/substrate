import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { ReferencePickerOption } from "./reference-picker-option";
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
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    search.current?.focus();
  }, []);
  const available = loading || error ? [] : results;
  const selectedIndex = Math.min(index, Math.max(0, available.length - 1));
  const insert = (id: string) => onInsert(`@[${kind}:${id}]`);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);
  return (
    <section
      aria-label="Insert workspace reference"
      className="flex max-h-36 flex-col gap-0.5 overflow-hidden border-t bg-card p-2"
    >
      <div className="flex shrink-0 items-center gap-1">
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
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="ml-auto"
          aria-label="Close references"
          title="Close references"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <Input
        ref={search}
        className="shrink-0"
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
        aria-describedby={`${listId}-help`}
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
      <p id={`${listId}-help`} className="shrink-0 text-xs text-muted-foreground">
        References don’t grant access; mentions notify members.
      </p>
      <div ref={list} className="min-h-8 flex-1 overflow-y-auto">
        {loading && <LoadingState label="Searching references" variant="compact" />}
        {error && <ErrorState compact title="Couldn’t search references" onRetry={onRetry} />}
        {!loading && !error && results.length === 0 && (
          <p className="text-sm text-muted-foreground">No accessible references found.</p>
        )}
        <div id={listId} role="listbox" aria-label="References">
          {available.map((item, itemIndex) => (
            <ReferencePickerOption
              id={`${listId}-${item.id}`}
              key={item.id}
              kind={kind}
              title={item.title}
              selected={selectedIndex === itemIndex}
              onSelect={() => insert(item.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
