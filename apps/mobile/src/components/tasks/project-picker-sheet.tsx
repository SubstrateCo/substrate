import { useQuery } from "@tanstack/react-query";

import { recordQueries } from "@/features/records/queries";
import { PickerSheet } from "@/features/records/ui/sheet";
import { ErrorState } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";

/** Picks one of the projects the reader can see. */
export function ProjectPickerSheet({
  scope,
  title,
  onSelect,
  onClose,
}: {
  scope: QueryScope;
  title: string;
  onSelect: (projectId: string) => void;
  onClose: () => void;
}) {
  const projects = useQuery(recordQueries.projects(scope));
  return (
    <PickerSheet
      title={title}
      searchable
      value={null}
      loading={projects.isPending}
      choices={(projects.error ? [] : (projects.data ?? [])).map((row) => ({
        value: row.entityId,
        label: row.name,
      }))}
      onSelect={onSelect}
      onClose={onClose}
      footer={
        projects.error ? (
          <ErrorState
            compact
            error={projects.error}
            noun="projects"
            onRetry={() => void projects.refetch()}
          />
        ) : undefined
      }
    />
  );
}
