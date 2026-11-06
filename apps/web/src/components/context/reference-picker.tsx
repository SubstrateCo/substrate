import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ReferencePicker as ReferencePickerView,
  type ReferenceKind,
} from "@/ui/messaging/reference-picker";
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
  const [kind, setKind] = useState<ReferenceKind>("task");
  const results = useQuery(searchOptions({ organizationId, conversationId, query, kind }));
  return (
    <ReferencePickerView
      query={query}
      kind={kind}
      results={results.data ?? []}
      loading={results.isPending}
      error={results.error}
      onQueryChange={setQuery}
      onKindChange={setKind}
      onRetry={() => void results.refetch()}
      onInsert={onInsert}
      onClose={onClose}
    />
  );
}
