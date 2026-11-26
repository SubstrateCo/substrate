import { taskStatusLabels } from "@substrate/contracts/tasks";

import { useQuery } from "@tanstack/react-query";

import { useRef, useState } from "react";

import { ProjectPickerSheet } from "./project-picker-sheet";
import { taskLinkCandidates } from "./task-link-options";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { recordQueries } from "@/features/records/queries";
import { PickerSheet } from "@/features/records/ui/sheet";
import { ErrorState } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";

export function TaskLinkPicker({
  scope,
  taskId,
  currentProjectId,
  title,
  onSelect,
  onClose,
}: {
  scope: QueryScope;
  taskId: string;
  currentProjectId: string;
  title: string;
  onSelect: (taskId: string) => void;
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState<string | null>(currentProjectId);
  const choosingProject = useRef(false);
  const project = useQuery(recordQueries.project(scope, projectId ?? undefined));
  if (!projectId)
    return (
      <ProjectPickerSheet
        scope={scope}
        title="Choose a project"
        onSelect={(id) => {
          choosingProject.current = true;
          setProjectId(id);
        }}
        onClose={() => {
          if (choosingProject.current) choosingProject.current = false;
          else onClose();
        }}
      />
    );
  return (
    <PickerSheet
      title={title}
      searchable
      value={null}
      loading={project.isPending}
      choices={taskLinkCandidates(project.error ? undefined : project.data, taskId).map((row) => ({
        value: row.entityId,
        label: row.title,
        description: `${project.data?.project.name ?? ""} · ${taskStatusLabels[row.status]}`,
      }))}
      onSelect={onSelect}
      onClose={onClose}
      footer={
        project.error ? (
          <ErrorState
            compact
            error={project.error}
            noun="tasks"
            onRetry={() => void project.refetch()}
          />
        ) : (
          <Button variant="ghost" onPress={() => setProjectId(null)}>
            <Text>Choose another project</Text>
          </Button>
        )
      }
    />
  );
}
