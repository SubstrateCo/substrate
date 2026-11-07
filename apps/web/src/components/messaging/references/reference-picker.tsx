import { useEffect, useId, useRef, useState } from "react";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import type { WorkspaceReference } from "./entity-reference";
import { ReferencePickerOption } from "./reference-picker-option";
import { X } from "lucide-react";

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
  onInsert: (token: string, reference: WorkspaceReference) => void;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState({ query, kind, index: 0 });
  const index = selection.query === query && selection.kind === kind ? selection.index : 0;
  if (selection.query !== query || selection.kind !== kind) setSelection({ query, kind, index: 0 });
  const setIndex = (index: number) => setSelection({ query, kind, index });
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const available = loading || error ? [] : results;
  const selectedIndex = Math.min(index, Math.max(0, available.length - 1));
  const selectedId = available[selectedIndex]
    ? `${listId}-${available[selectedIndex]!.id}`
    : undefined;
  const insert = (id: string) => {
    const item = available.find((item) => item.id === id);
    if (item) onInsert(`@[${kind}:${id}]`, { id, kind, label: item.title });
  };
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId, selectedIndex]);
  return (
    <Tabs
      value={kind}
      onValueChange={(value) => {
        if (value === "task" || value === "project" || value === "person") onKindChange(value);
      }}
      asChild
    >
      <section
        aria-label="Insert workspace reference"
        className="flex max-h-96 min-h-0 flex-col gap-2 overflow-hidden p-2"
      >
        <div className="flex shrink-0 items-center gap-1">
          <TabsList variant="line" aria-label="Reference type">
            {(["task", "project", "person"] as const).map((type) => (
              <TabsTrigger key={type} value={type}>
                {type === "person" ? "People" : `${type[0]!.toUpperCase()}${type.slice(1)}s`}
              </TabsTrigger>
            ))}
          </TabsList>
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
          className="shrink-0"
          aria-label="Search references"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
          }}
          role="combobox"
          aria-expanded={true}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={selectedId}
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
        {(["task", "project", "person"] as const).map((type) => (
          <TabsContent key={type} value={type} forceMount hidden={type !== kind} asChild>
            <div ref={type === kind ? list : undefined} className="min-h-8 flex-1 overflow-y-auto">
              {type === kind && (
                <>
                  {loading && <LoadingState label="Searching references" variant="compact" />}
                  {error && (
                    <ErrorState compact title="Couldn’t search references" onRetry={onRetry} />
                  )}
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
                </>
              )}
            </div>
          </TabsContent>
        ))}
      </section>
    </Tabs>
  );
}
