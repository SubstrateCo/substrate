import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import {
  ReferencePicker as ReferencePickerView,
  type ReferenceKind,
} from "@/components/messaging/references/reference-picker";
import { referenceQuery } from "@/components/messaging/references/reference-query";
import { searchOptions } from "@/queries/context/search";

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
  onInsert: (token: string, reference: WorkspaceReference) => void;
  onClose: () => void;
}) {
  const parsed = referenceQuery(`@${initialQuery}`, initialQuery.length + 1)!;
  const [search, setSearch] = useState({ source: initialQuery, query: parsed.query });
  const query = search.source === initialQuery ? search.query : parsed.query;
  if (search.source !== initialQuery) setSearch({ source: initialQuery, query: parsed.query });
  const [selection, setSelection] = useState<{ prefix: string; kind: ReferenceKind }>({
    prefix: parsed.kind,
    kind: parsed.kind === "all" ? "task" : parsed.kind,
  });
  const prefixKind = parsed.kind === "all" ? "task" : parsed.kind;
  const kind = selection.prefix === parsed.kind ? selection.kind : prefixKind;
  if (selection.prefix !== parsed.kind) setSelection({ prefix: parsed.kind, kind });
  const results = useQuery(searchOptions({ organizationId, conversationId, query, kind }));
  return (
    <ReferencePickerView
      query={query}
      kind={kind}
      results={results.data ?? []}
      loading={results.isPending}
      error={results.error}
      onQueryChange={(query) => setSearch({ source: initialQuery, query })}
      onKindChange={(kind) => setSelection({ prefix: parsed.kind, kind })}
      onRetry={() => void results.refetch()}
      onInsert={onInsert}
      onClose={onClose}
    />
  );
}
