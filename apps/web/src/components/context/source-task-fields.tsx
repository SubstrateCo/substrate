import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { createTaskFromMessage } from "@/api/context";
import { SourceTaskFields as SourceTaskFieldsView } from "@/components/context/source-task-fields-view";
import type { TaskDraft } from "@/components/tasks/types";
import { queryKeys } from "@/queries/keys";
import { projectQueryOptions } from "@/queries/tasks/options";

export function SourceTaskFields({
  organizationId,
  projectId,
  messageId,
  sourceText,
  onSaved,
  onClose,
}: {
  organizationId: string;
  projectId: string;
  messageId: string;
  sourceText: string;
  onSaved: (task: { entityId: string; projectEntityId: string }) => void;
  onClose: () => void;
}) {
  const project = useQuery(projectQueryOptions(organizationId, projectId));
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [lastDraft, setLastDraft] = useState("");
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: ({ draft, id }: { draft: TaskDraft; id: string }) =>
      createTaskFromMessage({
        data: { organizationId, projectEntityId: projectId, messageId, requestId: id, ...draft },
      }),
    onSuccess: async (task) => {
      await client.invalidateQueries({ queryKey: queryKeys.organization(organizationId) });
      onSaved(task);
    },
  });
  return (
    <SourceTaskFieldsView
      detail={project.data}
      loading={project.isPending}
      loadError={project.error}
      onRetry={() => void project.refetch()}
      sourceText={sourceText}
      pending={save.isPending}
      error={save.error}
      onCancel={onClose}
      onSubmit={(draft) => {
        const fingerprint = JSON.stringify(draft);
        const id = lastDraft && lastDraft !== fingerprint ? crypto.randomUUID() : requestId;
        setLastDraft(fingerprint);
        setRequestId(id);
        save.mutate({ draft, id });
      }}
    />
  );
}
