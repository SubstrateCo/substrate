import { useQueries } from "@tanstack/react-query";

import { useState } from "react";

import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import {
  ReferencePicker as ReferencePickerView,
  type ReferenceKind,
  type ReferenceTab,
} from "@/components/messaging/references/reference-picker";
import type { ReferenceQuery } from "@/components/messaging/references/reference-query";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { searchOptions } from "@/queries/context/search";

// "All" lists the best few of each kind, people first.
const mixedKinds: ReferenceKind[] = ["person", "agent", "task", "project"];
const mixedLimit = 5;

export function ReferencePicker({
  organizationId,
  conversationId,
  activeReference,
  onInsert,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  activeReference: ReferenceQuery;
  onInsert: (token: string, reference: WorkspaceReference) => void;
  onClose: () => void;
}) {
  const parsed = activeReference;
  const source = `${parsed.trigger}:${parsed.kind}:${parsed.query}`;
  const [search, setSearch] = useState({ source, query: parsed.query });
  const query = search.source === source ? search.query : parsed.query;
  if (search.source !== source) setSearch({ source, query: parsed.query });
  const [selection, setSelection] = useState<{ prefix: string; kind: ReferenceTab }>({
    prefix: parsed.kind,
    kind: parsed.kind,
  });
  const kind = selection.prefix === parsed.kind ? selection.kind : parsed.kind;
  if (selection.prefix !== parsed.kind) setSelection({ prefix: parsed.kind, kind });
  const debounced = useSearchDebounce(
    query,
    JSON.stringify([organizationId, conversationId, kind]),
  );
  const searchKinds = kind === "all" ? mixedKinds : [kind];
  const results = useQueries({
    queries: searchKinds.map((searchKind) => ({
      ...searchOptions({
        organizationId,
        conversationId,
        query: debounced.query,
        kind: searchKind,
      }),
      enabled: !debounced.pending,
    })),
  });
  const rows = results.flatMap((result, index) =>
    (result.data ?? [])
      .slice(0, kind === "all" ? mixedLimit : undefined)
      .map((row) => ({ ...row, kind: searchKinds[index]! })),
  );
  return (
    <ReferencePickerView
      query={query}
      kind={kind}
      kinds={
        parsed.trigger === "#"
          ? ["channel", "thread"]
          : ["all", "person", "agent", "task", "project"]
      }
      results={debounced.pending ? [] : rows}
      loading={debounced.pending || results.some((result) => result.isPending)}
      error={debounced.pending ? null : (results.find((result) => result.error)?.error ?? null)}
      onQueryChange={(query) => setSearch({ source, query })}
      onKindChange={(kind) => setSelection({ prefix: parsed.kind, kind })}
      onRetry={() => {
        if (!debounced.pending) for (const result of results) void result.refetch();
      }}
      onInsert={(token, reference) => {
        if (!debounced.pending) onInsert(token, reference);
      }}
      onClose={onClose}
    />
  );
}
