import {
  taskPriorityValues,
  taskStatusValues,
  type TaskPriority,
  type TaskStatus,
  taskStatusLabels,
} from "@substrate/contracts/tasks";
import {
  taskLinkRelation,
  taskLinkRelationLabels,
  taskLinkRelations,
  type TaskLinkRelation,
} from "@substrate/contracts/tasks/links";

import { useMutation, useQuery } from "@tanstack/react-query";

import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { taskAssignees } from "./task-access";
import { TaskAttachments } from "./task-attachments";
import { TaskForm } from "./task-form";
import { TaskLinkPicker } from "./task-link-picker";
import { TaskMessageContext } from "./task-message-context";
import { TaskMove } from "./task-move";
import { RecordConnections } from "@/components/crm/record-connections";
import { Text } from "@/components/ui/text";
import { canEdit, formatDate, taskPriorityLabels } from "@/features/records/format";
import { recordQueries, useRecordScope, useTasksWrite } from "@/features/records/queries";
import type { ProjectDetail, ProjectTask } from "@/features/records/requests";
import { taskApi } from "@/features/records/task-api";
import type { OnOpenRecord } from "@/features/records/types";
import { dateFieldValid, DateField } from "@/features/records/ui/fields";
import { DetailHeader } from "@/features/records/ui/layout";
import { DetailSection, Property, Row, TaskStatusIcon } from "@/features/records/ui/rows";
import { ActionSheet, ConfirmSheet, FormSheet, PickerSheet } from "@/features/records/ui/sheet";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  MutationError,
  Notice,
} from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";
import { Archive, Link2, ListTodo, Lock } from "lucide-react-native";

type Props = {
  organizationId: string;
  taskId: string;
  projectId?: string;
  onOpenRecord: OnOpenRecord;
  onClose?: () => void;
  onOpenConversation?: (conversationId: string, messageId?: string) => void;
};

/** A task, read through its project. Without a project ID the server tells us which project. */
export function TaskDetailView(props: Props) {
  const scope = useRecordScope(props.organizationId);
  const location = useQuery({
    ...recordQueries.taskLocation(scope, props.taskId),
    staleTime: 0,
  });
  const projectId = location.error
    ? undefined
    : (location.data?.projectEntityId ?? props.projectId);
  if (!projectId)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader
          kind="Task"
          title={location.error ? "Task" : "Loading…"}
          icon={ListTodo}
          onClose={props.onClose}
        />
        {location.error ? (
          <ErrorState
            error={location.error}
            noun="this task"
            onRetry={() => void location.refetch()}
          />
        ) : (
          <LoadingRows label="Loading task" />
        )}
      </View>
    );
  return <TaskInProject {...props} scope={scope} projectId={projectId} />;
}

type Picking = "status" | "priority" | "assignee" | "move" | "linkRelation" | null;

function TaskInProject({
  scope,
  projectId,
  taskId,
  onOpenRecord,
  onClose,
  onOpenConversation,
}: Props & { scope: QueryScope; projectId: string }) {
  const query = useQuery(recordQueries.project(scope, projectId));
  const write = useTasksWrite(scope);
  const [picking, setPicking] = useState<Picking>(null);
  const [editing, setEditing] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [dueEditing, setDueEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkRelation, setLinkRelation] = useState<TaskLinkRelation | null>(null);
  const [linkMenu, setLinkMenu] = useState<string | null>(null);
  const detail = query.data;
  const task = detail?.tasks.find((row) => row.entityId === taskId);
  const discussion = useMutation({
    retry: false,
    mutationFn: () =>
      taskApi.discussion({
        organizationId: scope.organizationId,
        projectEntityId: projectId,
        taskEntityId: taskId,
      }),
    onSuccess: (result) => onOpenConversation?.(result.conversationId),
  });

  if (query.isPending)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader kind="Task" title="Loading…" icon={ListTodo} onClose={onClose} />
        <LoadingRows label="Loading task" />
      </View>
    );
  if (query.error || !detail || !task)
    return (
      <View className="flex-1 bg-surface">
        <DetailHeader kind="Task" title="Task" icon={ListTodo} onClose={onClose} />
        {query.error ? (
          <ErrorState error={query.error} noun="this task" onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState
            icon={Lock}
            title="This task was deleted or moved"
            description="Open it again from its project."
          />
        )}
      </View>
    );

  const archived = !!detail.project.archivedAt;
  const editable = canEdit(detail.level) && !archived;
  const update = (
    fields: Partial<Pick<ProjectTask, "status" | "priority" | "assigneeActorEntityId" | "dueDate">>,
  ) =>
    write.mutate({
      action: "updateTask",
      projectEntityId: projectId,
      taskEntityId: taskId,
      ...fields,
    });
  const assignee = detail.actors.find((actor) => actor.entityId === task.assigneeActorEntityId);
  const parent = detail.tasks.find((row) => row.entityId === task.parentTaskEntityId);
  const subtasks = detail.tasks.filter((row) => row.parentTaskEntityId === taskId);
  const links = taskLinks(detail, taskId);

  return (
    <View className="flex-1 bg-surface" testID="task-detail">
      <DetailHeader
        kind={`Task · ${detail.project.name}`}
        title={task.title}
        icon={ListTodo}
        onClose={onClose}
        onEdit={editable ? () => setEditing(true) : undefined}
        actions={
          editable
            ? [
                { label: "Move to another project", onPress: () => setPicking("move") },
                { label: "Delete task", destructive: true, onPress: () => setDeleting(true) },
              ]
            : []
        }
      />
      {archived ? (
        <Notice icon={Archive}>This task's project is archived and read-only.</Notice>
      ) : null}
      {!archived && !editable ? <Notice>You can view this task but not change it.</Notice> : null}
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
      >
        {write.error && !editing && !addingSubtask && !dueEditing && !deleting ? (
          <View className="px-4 pt-2">
            <MutationError error={write.error} />
          </View>
        ) : null}
        <View className="mt-2 border-t border-border">
          <Property
            label="Status"
            value={taskStatusLabels[task.status]}
            onPress={editable ? () => setPicking("status") : undefined}
          />
          <Property
            label="Priority"
            value={taskPriorityLabels[task.priority]}
            onPress={editable ? () => setPicking("priority") : undefined}
          />
          <Property
            label="Assignee"
            value={assignee?.name ?? (task.assigneeActorEntityId ? "Someone you can't see" : null)}
            placeholder="Unassigned"
            onPress={editable ? () => setPicking("assignee") : undefined}
          />
          <Property
            label="Due"
            value={formatDate(task.dueDate)}
            placeholder="No due date"
            onPress={editable ? () => setDueEditing(true) : undefined}
          />
          <Property
            label="Project"
            value={detail.project.name}
            onPress={() => onOpenRecord({ kind: "project", id: projectId })}
          />
          {parent ? (
            <Property
              label="Parent"
              value={parent.title}
              onPress={() => onOpenRecord({ kind: "task", id: parent.entityId, projectId })}
            />
          ) : null}
        </View>
        <DetailSection title="Description">
          <Text className="px-4 py-3 text-sm" selectable>
            {task.description || "No description."}
          </Text>
        </DetailSection>
        {onOpenConversation && (!archived || task.discussionConversationId) ? (
          <DetailSection title="Discussion">
            <Row
              title={discussion.isPending ? "Opening discussion…" : "Open discussion"}
              subtitle="Messages shared with this task's readers"
              chevron
              onPress={
                discussion.isPending
                  ? undefined
                  : () => {
                      if (task.discussionConversationId)
                        onOpenConversation(task.discussionConversationId);
                      else discussion.mutate();
                    }
              }
            />
            {discussion.error ? (
              <View className="px-4 py-2">
                <MutationError error={discussion.error} />
              </View>
            ) : null}
          </DetailSection>
        ) : null}
        <TaskMessageContext
          scope={scope}
          entityId={taskId}
          onOpenConversation={onOpenConversation}
        />
        <RecordConnections
          scope={scope}
          entityId={taskId}
          editable={false}
          onOpenRecord={onOpenRecord}
        />
        <TaskAttachments
          scope={scope}
          target={{
            organizationId: scope.organizationId,
            projectEntityId: projectId,
            taskEntityId: taskId,
          }}
          editable={editable}
        />
        <DetailSection
          title="Subtasks"
          count={subtasks.length || undefined}
          action={
            editable ? { label: "New subtask", onPress: () => setAddingSubtask(true) } : undefined
          }
        >
          {subtasks.length ? (
            subtasks.map((row) => (
              <Row
                key={row.entityId}
                title={row.title}
                subtitle={taskStatusLabels[row.status]}
                leading={<TaskStatusIcon status={row.status} />}
                chevron
                onPress={() => onOpenRecord({ kind: "task", id: row.entityId, projectId })}
              />
            ))
          ) : (
            <Text className="px-4 py-3 text-sm text-muted-foreground">No subtasks.</Text>
          )}
        </DetailSection>
        <DetailSection
          title="Linked tasks"
          count={links.length || undefined}
          action={
            editable
              ? { label: "Link a task", icon: Link2, onPress: () => setPicking("linkRelation") }
              : undefined
          }
        >
          {links.length ? (
            links.map((link) => (
              <Row
                key={link.id}
                title={link.other?.title ?? "A task you can't open"}
                subtitle={`${taskLinkRelationLabels[link.relation]}${link.other ? ` · ${link.other.projectName}` : ""}${link.blocking ? " · Blocking" : ""}`}
                leading={link.other ? <TaskStatusIcon status={link.other.status} /> : undefined}
                onPress={() => {
                  if (editable) setLinkMenu(link.id);
                  else if (link.other)
                    onOpenRecord({
                      kind: "task",
                      id: link.other.entityId,
                      projectId: link.other.projectEntityId,
                    });
                }}
                chevron={!editable && !!link.other}
              />
            ))
          ) : (
            <Text className="px-4 py-3 text-sm text-muted-foreground">No linked tasks.</Text>
          )}
        </DetailSection>
        <View className="h-10" />
      </ScrollView>

      {picking === "status" ? (
        <PickerSheet
          title="Status"
          value={task.status}
          choices={taskStatusValues.map((value) => ({ value, label: taskStatusLabels[value] }))}
          onSelect={(status: TaskStatus) => update({ status })}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {picking === "priority" ? (
        <PickerSheet
          title="Priority"
          value={task.priority}
          choices={taskPriorityValues.map((value) => ({ value, label: taskPriorityLabels[value] }))}
          onSelect={(priority: TaskPriority) => update({ priority })}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {picking === "assignee" ? (
        <PickerSheet
          title="Assignee"
          searchable
          value={task.assigneeActorEntityId ?? "unassigned"}
          choices={[
            { value: "unassigned", label: "Unassigned" },
            ...taskAssignees(detail, task.assigneeActorEntityId).map((actor) => ({
              value: actor.entityId,
              label: actor.name,
              description: actor.type === "agent" ? "Agent" : undefined,
            })),
          ]}
          onSelect={(value) =>
            update({ assigneeActorEntityId: value === "unassigned" ? null : value })
          }
          onClose={() => setPicking(null)}
        />
      ) : null}
      {picking === "move" ? (
        <TaskMove
          scope={scope}
          currentProjectId={projectId}
          taskId={taskId}
          pending={write.isPending}
          error={write.error}
          onClose={() => setPicking(null)}
          onSave={(destination, parentTaskEntityId) =>
            write.mutate(
              {
                action: "moveTask",
                projectEntityId: projectId,
                taskEntityId: taskId,
                destinationProjectEntityId: destination,
                parentTaskEntityId,
              },
              {
                onSuccess: () => {
                  setPicking(null);
                  onOpenRecord({ kind: "task", id: taskId, projectId: destination });
                },
              },
            )
          }
        />
      ) : null}
      {picking === "linkRelation" ? (
        <PickerSheet
          title="Link type"
          value={null}
          choices={taskLinkRelations.map((value) => ({
            value,
            label: taskLinkRelationLabels[value],
          }))}
          onSelect={setLinkRelation}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {linkRelation ? (
        <TaskLinkPicker
          scope={scope}
          taskId={taskId}
          currentProjectId={projectId}
          title={`${taskLinkRelationLabels[linkRelation]}…`}
          onSelect={(otherTaskEntityId) =>
            write.mutate({
              action: "addTaskLink",
              projectEntityId: projectId,
              taskEntityId: taskId,
              relation: linkRelation,
              otherTaskEntityId,
            })
          }
          onClose={() => setLinkRelation(null)}
        />
      ) : null}
      {linkMenu ? (
        <LinkMenu
          link={links.find((link) => link.id === linkMenu)}
          onClose={() => setLinkMenu(null)}
          onOpen={(other) =>
            onOpenRecord({ kind: "task", id: other.entityId, projectId: other.projectEntityId })
          }
          onRemove={() =>
            write.mutate({
              action: "removeTaskLink",
              projectEntityId: projectId,
              taskEntityId: taskId,
              linkId: linkMenu,
            })
          }
        />
      ) : null}
      {editing ? (
        <TaskForm
          task={task}
          actors={taskAssignees(detail, task.assigneeActorEntityId)}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setEditing(false);
          }}
          onSubmit={(draft) =>
            write.mutate(
              { action: "updateTask", projectEntityId: projectId, taskEntityId: taskId, ...draft },
              { onSuccess: () => setEditing(false) },
            )
          }
        />
      ) : null}
      {addingSubtask ? (
        <TaskForm
          parentTitle={task.title}
          actors={taskAssignees(detail)}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setAddingSubtask(false);
          }}
          onSubmit={(draft) =>
            write.mutate(
              {
                action: "createTask",
                projectEntityId: projectId,
                parentTaskEntityId: taskId,
                ...draft,
              },
              { onSuccess: () => setAddingSubtask(false) },
            )
          }
        />
      ) : null}
      {dueEditing ? (
        <DueDateSheet
          value={task.dueDate}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setDueEditing(false);
          }}
          onSave={(dueDate) =>
            write.mutate(
              { action: "updateTask", projectEntityId: projectId, taskEntityId: taskId, dueDate },
              { onSuccess: () => setDueEditing(false) },
            )
          }
        />
      ) : null}
      {deleting ? (
        <ConfirmSheet
          title="Delete this task?"
          description={
            subtasks.length
              ? "This also deletes all its subtasks, including nested subtasks. You can't undo this."
              : "You can't undo this."
          }
          confirmLabel="Delete"
          destructive
          pending={write.isPending}
          error={write.error}
          onCancel={() => setDeleting(false)}
          onConfirm={() =>
            write.mutate(
              { action: "deleteTask", projectEntityId: projectId, taskEntityId: taskId },
              {
                onSuccess: () => {
                  setDeleting(false);
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

type LinkEnd = NonNullable<ProjectDetail["links"][number]["source"]>;
type ViewedLink = {
  id: string;
  relation: TaskLinkRelation;
  other: LinkEnd | null;
  blocking: boolean;
};

function taskLinks(detail: ProjectDetail, taskId: string): ViewedLink[] {
  return detail.links.flatMap((link) => {
    if (link.source?.entityId === taskId)
      return [
        {
          id: link.id,
          relation: taskLinkRelation(link.kind, "source"),
          other: link.target,
          blocking: link.blocking,
        },
      ];
    if (link.target?.entityId === taskId)
      return [
        {
          id: link.id,
          relation: taskLinkRelation(link.kind, "target"),
          other: link.source,
          blocking: link.blocking,
        },
      ];
    return [];
  });
}

function LinkMenu({
  link,
  onClose,
  onOpen,
  onRemove,
}: {
  link: ViewedLink | undefined;
  onClose: () => void;
  onOpen: (other: LinkEnd) => void;
  onRemove: () => void;
}) {
  if (!link) return null;
  const other = link.other;
  return (
    <ActionSheet
      title={other?.title ?? "Linked task"}
      onClose={onClose}
      actions={[
        ...(other ? [{ label: "Open task", onPress: () => onOpen(other) }] : []),
        { label: "Remove link", destructive: true, onPress: onRemove },
      ]}
    />
  );
}

function DueDateSheet({
  value,
  pending,
  error,
  onSave,
  onClose,
}: {
  value: string | null;
  pending: boolean;
  error: Error | null;
  onSave: (value: string | null) => void;
  onClose: () => void;
}) {
  const [due, setDue] = useState(value ?? "");
  return (
    <FormSheet
      title="Due date"
      dirty={due !== (value ?? "")}
      pending={pending}
      canSave={dateFieldValid(due)}
      error={error}
      onClose={onClose}
      onSave={() => onSave(due || null)}
    >
      <DateField label="Due date" value={due} onChange={setDue} />
    </FormSheet>
  );
}
