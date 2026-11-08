import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import {
  ReferencePicker as ReferencePickerView,
  type ReferenceKind,
} from "@/components/messaging/references/reference-picker";
import type { ReferenceQuery } from "@/components/messaging/references/reference-query";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { searchOptions } from "@/queries/context/search";

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
  const [selection, setSelection] = useState<{ prefix: string; kind: ReferenceKind }>({
    prefix: parsed.kind,
    kind: parsed.kind === "all" ? "task" : parsed.kind,
  });
  const prefixKind = parsed.kind === "all" ? "task" : parsed.kind;
  const kind = selection.prefix === parsed.kind ? selection.kind : prefixKind;
  if (selection.prefix !== parsed.kind) setSelection({ prefix: parsed.kind, kind });
  const debounced = useSearchDebounce(
    query,
    JSON.stringify([organizationId, conversationId, kind]),
  );
  const results = useQuery({
    ...searchOptions({ organizationId, conversationId, query: debounced.query, kind }),
    enabled: !debounced.pending,
  });
  return (
    <ReferencePickerView
      query={query}
      kind={kind}
      kinds={
        parsed.trigger === "#" ? ["channel", "thread"] : ["task", "project", "person", "agent"]
      }
      results={debounced.pending ? [] : (results.data ?? [])}
      loading={debounced.pending || results.isPending}
      error={debounced.pending ? null : results.error}
      onQueryChange={(query) => setSearch({ source, query })}
      onKindChange={(kind) => setSelection({ prefix: parsed.kind, kind })}
      onRetry={() => {
        if (!debounced.pending) void results.refetch();
      }}
      onInsert={(token, reference) => {
        if (!debounced.pending) onInsert(token, reference);
      }}
      onClose={onClose}
    />
  );
}
