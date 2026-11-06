import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreateSourceTask as CreateSourceTaskView } from "@startup-os/ui/context/create-source-task";
import { searchOptions } from "@/queries/context/options";
import { workHref } from "@/lib/context-links";
import { SourceTaskFields } from "./source-task-fields";

export function CreateSourceTask({
  organizationId,
  messageId,
  body,
  onClose,
}: {
  organizationId: string;
  messageId: string;
  body: string;
  onClose: () => void;
}) {
  const projects = useQuery(
    searchOptions({ organizationId, query: "", kind: "project", editable: true }),
  );
  const [created, setCreated] = useState<{ entityId: string; projectEntityId: string } | null>(
    null,
  );
  return (
    <CreateSourceTaskView
      body={body}
      projects={projects.data ?? []}
      loading={projects.isPending}
      error={projects.error}
      onRetry={() => void projects.refetch()}
      createdHref={
        created ? workHref(organizationId, created.projectEntityId, created.entityId) : undefined
      }
      onClose={onClose}
      renderFields={(projectId, sourceText) => (
        <SourceTaskFields
          key={projectId}
          organizationId={organizationId}
          projectId={projectId}
          messageId={messageId}
          sourceText={sourceText}
          onSaved={setCreated}
          onClose={onClose}
        />
      )}
    />
  );
}
