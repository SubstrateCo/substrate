import { projectCapabilities } from "@substrate/contracts/access/capabilities";
import { permissionLabels } from "@substrate/contracts/access/levels";
import { assignableActors } from "@substrate/contracts/tasks/project-access";

import { useQuery } from "@tanstack/react-query";

import { useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { ProjectForm } from "./project-form";
import { ProjectMembers } from "./project-members";
import { ProjectPicture } from "./project-picture";
import { TaskForm } from "./task-form";
import { TaskMessageContext } from "./task-message-context";
import { taskTree, TaskRow } from "./task-row";
import { RecordConnections } from "@/components/crm/record-connections";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { oneOf, type FilterField, type FilterValue } from "@/features/records/filters";
import { openTask } from "@/features/records/format";
import { recordQueries, useRecordScope, useTasksWrite } from "@/features/records/queries";
import type { ProjectTask } from "@/features/records/requests";
import type { OnOpenRecord } from "@/features/records/types";
import { FilterBar } from "@/features/records/ui/filter-bar";
import { DetailHeader } from "@/features/records/ui/layout";
import { Chip } from "@/features/records/ui/rows";
import { ConfirmSheet } from "@/features/records/ui/sheet";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  MutationError,
  Notice,
} from "@/features/records/ui/states";
import { Archive, CircleCheck, FolderKanban, ListTodo, Plus } from "lucide-react-native";

type Filter = "open" | "done" | "all";
const statusFilters = ["open", "done"] as const;
const emptyTitles: Record<Filter, string> = {
  open: "No open tasks",
  done: "No finished tasks",
  all: "No tasks yet",
};

export function ProjectDetailView({
  organizationId,
  projectId,
  onOpenRecord,
  onClose,
  onOpenConversation,
}: {
  organizationId: string;
  projectId: string;
  onOpenRecord: OnOpenRecord;
  onClose?: () => void;
  onOpenConversation?: (conversationId: string, messageId?: string) => void;
}) {
  const scope = useRecordScope(organizationId);
  const query = useQuery(recordQueries.project(scope, projectId));
  const write = useTasksWrite(scope);
  const [filters, setFilters] = useState<FilterValue<"status">>({ status: ["open"] });
  // No status filter shows every task.
  const filter: Filter = oneOf(filters.status, statusFilters) ?? "all";
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [members, setMembers] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const detail = query.data;

  const rows = useMemo(() => {
    if (!detail) return [];
    const include = {
      open: (task: ProjectTask) => openTask(task.status),
      done: (task: ProjectTask) => !openTask(task.status),
      all: () => true,
    }[filter];
    return taskTree(detail.tasks, include);
  }, [detail, filter]);

  if (query.isPending)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader kind="Project" title="Loading…" icon={FolderKanban} onClose={onClose} />
        <LoadingRows label="Loading project" />
      </View>
    );
  if (query.error || !detail)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader kind="Project" title="Project" icon={FolderKanban} onClose={onClose} />
        <ErrorState error={query.error} noun="this project" onRetry={() => void query.refetch()} />
      </View>
    );

  const { project, level } = detail;
  const archived = !!project.archivedAt;
  const { canEdit: editable, canArchive } = projectCapabilities({ level, archived });
  const openCount = detail.tasks.filter((task) => openTask(task.status)).length;
  const statusField: FilterField<"status"> = {
    id: "status",
    label: "Status",
    icon: CircleCheck,
    options: [
      { value: "open", label: "Open", count: openCount },
      { value: "done", label: "Done", count: detail.tasks.length - openCount },
    ],
  };

  return (
    <View className="flex-1 bg-surface" testID="project-detail">
      <DetailHeader
        kind="Project"
        title={project.name}
        icon={FolderKanban}
        onClose={onClose}
        onEdit={editable ? () => setEditing(true) : undefined}
        actions={[
          {
            label: "Members and access",
            onPress: () => setMembers(true),
            hint: `${detail.members.length} members`,
          },
          ...(canArchive && !archived
            ? [
                {
                  label: "Archive project",
                  onPress: () => setConfirm("archive"),
                  hint: "Makes the project and its tasks read-only.",
                },
              ]
            : []),
          ...(canArchive && archived
            ? [
                {
                  label: "Restore project",
                  onPress: () =>
                    write.mutate({ action: "restoreProject", projectEntityId: project.entityId }),
                },
                { label: "Delete project", destructive: true, onPress: () => setConfirm("delete") },
              ]
            : []),
        ]}
        trailing={<Chip label={permissionLabels[level]} tone="outline" />}
      />
      {archived ? <Notice icon={Archive}>This project is archived and read-only.</Notice> : null}
      {!archived && !editable ? (
        <Notice>You can view this project but not change its tasks.</Notice>
      ) : null}
      {write.error && !confirm && !editing && !creating ? (
        <View className="px-4 pt-2">
          <MutationError error={write.error} />
        </View>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.task.entityId}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        ListHeaderComponent={
          <View>
            <ProjectPicture
              scope={scope}
              projectId={projectId}
              image={project.image}
              editable={editable}
            />
            {project.description ? (
              <Text className="px-4 pb-1 pt-3 text-sm text-muted-foreground">
                {project.description}
              </Text>
            ) : null}
            <TaskMessageContext
              scope={scope}
              entityId={projectId}
              onOpenConversation={onOpenConversation}
            />
            <RecordConnections
              scope={scope}
              entityId={projectId}
              editable={false}
              onOpenRecord={onOpenRecord}
            />
            <FilterBar
              label="Task filters"
              fields={[statusField]}
              value={filters}
              onChange={setFilters}
              trailing={
                editable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-1"
                    onPress={() => setCreating(true)}
                    accessibilityLabel="New task"
                    testID="new-task"
                  >
                    <Icon as={Plus} className="size-4 text-foreground" />
                    <Text>Task</Text>
                  </Button>
                ) : undefined
              }
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={ListTodo}
            title={emptyTitles[filter]}
            action={
              editable && filter !== "done" ? (
                <Button size="sm" onPress={() => setCreating(true)}>
                  <Text>New task</Text>
                </Button>
              ) : undefined
            }
          />
        }
        renderItem={({ item }) => (
          <TaskRow
            row={item}
            actors={detail.actors}
            canEdit={editable}
            onOpen={() =>
              onOpenRecord({ kind: "task", id: item.task.entityId, projectId: project.entityId })
            }
            onToggleDone={() =>
              write.mutate({
                action: "updateTask",
                projectEntityId: project.entityId,
                taskEntityId: item.task.entityId,
                status: openTask(item.task.status) ? "completed" : "not_started",
              })
            }
          />
        )}
      />
      {editing ? (
        <ProjectForm
          project={project}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setEditing(false);
          }}
          onSubmit={(value) =>
            write.mutate(
              { action: "updateProject", projectEntityId: project.entityId, ...value },
              { onSuccess: () => setEditing(false) },
            )
          }
        />
      ) : null}
      {creating ? (
        <TaskForm
          actors={assignableActors(detail)}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setCreating(false);
          }}
          onSubmit={(draft) =>
            write.mutate(
              { action: "createTask", projectEntityId: project.entityId, ...draft },
              { onSuccess: () => setCreating(false) },
            )
          }
        />
      ) : null}
      {members ? (
        <ProjectMembers scope={scope} detail={detail} onClose={() => setMembers(false)} />
      ) : null}
      {confirm === "archive" ? (
        <ConfirmSheet
          title="Archive this project?"
          description="The project and its tasks become read-only for everyone until an owner restores it."
          confirmLabel="Archive"
          pending={write.isPending}
          error={write.error}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            write.mutate(
              { action: "archiveProject", projectEntityId: project.entityId },
              { onSuccess: () => setConfirm(null) },
            )
          }
        />
      ) : null}
      {confirm === "delete" ? (
        <ConfirmSheet
          title="Delete this project?"
          description={`This deletes ${project.name} and all ${detail.tasks.length} of its tasks for everyone. You can't undo this.`}
          confirmLabel="Delete"
          destructive
          pending={write.isPending}
          error={write.error}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            write.mutate(
              { action: "deleteProject", projectEntityId: project.entityId },
              {
                onSuccess: () => {
                  setConfirm(null);
                  onClose?.();
                },
              },
            )
          }
        />
      ) : null}
    </View>
  );
}
