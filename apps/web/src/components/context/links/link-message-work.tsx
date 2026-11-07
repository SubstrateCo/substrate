import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { attachWork } from "@/api/context/links";
import { LinkMessageWork as LinkMessageWorkView } from "@/components/context/links/link-message-work-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { invalidateMessageWork } from "@/queries/context/mutations";
import { searchOptions } from "@/queries/context/search";
import { toast } from "sonner";

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
    mutationFn: ({ entityId }: { entityId: string; projectEntityId: string }) =>
      attachWork({ data: { organizationId, messageId, entityId } }),
    onError: (error) =>
      toast.error(
        actionErrorMessage(error, "Couldn't link this item. Check that you still have access."),
      ),
    onSuccess: async (_, { entityId, projectEntityId }) => {
      await invalidateMessageWork(client, organizationId, messageId, entityId, projectEntityId);
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
      pendingId={attach.isPending ? attach.variables.entityId : undefined}
      onQueryChange={setQuery}
      onKindChange={setKind}
      onRetry={() => void results.refetch()}
      onLink={(entityId) => {
        const work = results.data?.find((item) => item.id === entityId);
        if (work) attach.mutate({ entityId, projectEntityId: work.projectEntityId ?? entityId });
      }}
      onClose={onClose}
    />
  );
}
