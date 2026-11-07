import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { attachWork } from "@/api/context/links";
import { LinkMessageWork as LinkMessageWorkView } from "@/components/context/links/link-message-work-view";
import { searchOptions } from "@/queries/context/search";
import { queryKeys } from "@/queries/keys";

export function LinkMessageWork({
  organizationId,
  messageId,
  onClose,
}: {
  organizationId: string;
  messageId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"task" | "project">("task");
  const results = useQuery(searchOptions({ organizationId, query, kind, editable: true }));
  const client = useQueryClient();
  const attach = useMutation({
    mutationFn: (entityId: string) => attachWork({ data: { organizationId, messageId, entityId } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.organization(organizationId) });
      onClose();
    },
  });
  return (
    <LinkMessageWorkView
      query={query}
      kind={kind}
      results={results.data ?? []}
      loading={results.isPending}
      error={results.error}
      pendingId={attach.isPending ? attach.variables : undefined}
      actionError={attach.error}
      onQueryChange={setQuery}
      onKindChange={setKind}
      onRetry={() => void results.refetch()}
      onLink={(id) => attach.mutate(id)}
      onClose={onClose}
    />
  );
}
