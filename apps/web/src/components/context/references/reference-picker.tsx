import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import {
  ReferencePicker as ReferencePickerView,
  type ReferenceKind,
} from "@/components/messaging/references/reference-picker";
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
  onInsert: (token: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState({ source: initialQuery, query: initialQuery });
  const query = search.source === initialQuery ? search.query : initialQuery;
  if (search.source !== initialQuery) setSearch({ source: initialQuery, query: initialQuery });
  const [kind, setKind] = useState<ReferenceKind>("task");
  const results = useQuery(searchOptions({ organizationId, conversationId, query, kind }));
  return (
    <ReferencePickerView
      query={query}
      kind={kind}
      results={results.data ?? []}
      loading={results.isPending}
      error={results.error}
      onQueryChange={(query) => setSearch({ source: initialQuery, query })}
      onKindChange={setKind}
      onRetry={() => void results.refetch()}
      onInsert={onInsert}
      onClose={onClose}
    />
  );
}
