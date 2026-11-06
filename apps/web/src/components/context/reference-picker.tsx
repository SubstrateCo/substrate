import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@startup-os/ui/primitives/button";
import { Input } from "@startup-os/ui/primitives/input";
import { ErrorState } from "@startup-os/ui/feedback/error-state";
import { LoadingState } from "@startup-os/ui/feedback/loading-state";
import { searchOptions } from "@/queries/context/options";

export function ReferencePicker({
  organizationId,
  conversationId,
  initialQuery,
  onInsert,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  initialQuery: string;
  onInsert: (token: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<"task" | "project" | "person">("task");
  const [index, setIndex] = useState(0);
  const results = useQuery(searchOptions({ organizationId, conversationId, query, kind }));
  const insert = (id: string) => onInsert(`@[${kind}:${id}]`);
  return (
    <section aria-label="Insert workspace reference" className="space-y-2 border-t p-3">
      <div className="flex gap-2">
        {(["task", "project", "person"] as const).map((type) => (
          <Button
            key={type}
            type="button"
            size="xs"
            variant="outline"
            aria-pressed={kind === type}
            onClick={() => {
              setKind(type);
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
          setQuery(e.target.value);
          setIndex(0);
        }}
        role="combobox"
        aria-expanded={true}
        aria-controls="reference-options"
        aria-activedescendant={
          results.data?.[index] ? `reference-${results.data[index]!.id}` : undefined
        }
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((current) => Math.min(current + 1, (results.data?.length ?? 1) - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((current) => Math.max(0, current - 1));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            const selected = results.data?.[index];
            if (selected) insert(selected.id);
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        References do not grant access. People mentions notify conversation members.
      </p>
      {results.isPending && <LoadingState label="Searching references" variant="compact" />}
      {results.error && (
        <ErrorState
          compact
          title="Couldn’t search references"
          onRetry={() => void results.refetch()}
        />
      )}
      {!results.error && results.data?.length === 0 && <p>No accessible references found.</p>}
      <div
        id="reference-options"
        role="listbox"
        aria-label="References"
        className="max-h-48 overflow-auto"
      >
        {!results.error &&
          results.data?.map((item, itemIndex) => (
            <Button
              id={`reference-${item.id}`}
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === itemIndex}
              variant="ghost"
              className="w-full justify-start"
              onClick={() => insert(item.id)}
            >
              {item.title}
            </Button>
          ))}
      </div>
      <Button type="button" size="xs" variant="ghost" onClick={onClose}>
        Close references
      </Button>
    </section>
  );
}
