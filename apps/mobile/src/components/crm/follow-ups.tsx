import { taskStatusLabels } from "@substrate/contracts/tasks";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { Text } from "@/components/ui/text";
import { useWorkspaceApps } from "@/features/records/apps";
import { formatDate, newRequestId } from "@/features/records/format";
import { recordQueries, useCrmWrite } from "@/features/records/queries";
import type { OnOpenRecord } from "@/features/records/types";
import {
  dateFieldValid,
  DateField,
  SelectField,
  SwitchField,
  TextField,
} from "@/features/records/ui/fields";
import { DetailSection, DueChip, Row, TaskStatusIcon } from "@/features/records/ui/rows";
import { FormSheet } from "@/features/records/ui/sheet";
import { SectionQuery } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";

/**
 * Open tasks linked to a CRM record. The server reads and creates them only while both CRM and
 * Tasks are on, so the section hides otherwise.
 */
export function FollowUps({
  scope,
  entityId,
  canCreate,
  onOpenRecord,
}: {
  scope: QueryScope;
  entityId: string;
  canCreate: boolean;
  onOpenRecord: OnOpenRecord;
}) {
  const apps = useWorkspaceApps(scope);
  if (!apps.enabled("crm") || !apps.enabled("tasks")) return null;
  return (
    <EnabledFollowUps
      scope={scope}
      entityId={entityId}
      canCreate={canCreate}
      onOpenRecord={onOpenRecord}
    />
  );
}

function EnabledFollowUps({
  scope,
  entityId,
  canCreate,
  onOpenRecord,
}: {
  scope: QueryScope;
  entityId: string;
  canCreate: boolean;
  onOpenRecord: OnOpenRecord;
}) {
  const query = useQuery(recordQueries.followUps(scope, entityId));
  const [creating, setCreating] = useState(false);
  const data = query.data;
  return (
    <DetailSection
      title="Follow-ups"
      count={data?.tasks.length || undefined}
      action={canCreate ? { label: "New follow-up", onPress: () => setCreating(true) } : undefined}
    >
      <SectionQuery
        pending={query.isPending}
        error={query.error}
        noun="follow-ups"
        onRetry={() => void query.refetch()}
        emptyText={data?.tasks.length ? null : "No open follow-ups you can read."}
      >
        {data?.nextAction ? (
          <Text className="px-4 py-2 text-xs text-muted-foreground">
            Next: {data.nextAction.title}, due {formatDate(data.nextAction.dueDate)}
          </Text>
        ) : null}
        {data?.tasks.map((task) => (
          <Row
            key={task.entityId}
            title={task.title}
            subtitle={taskStatusLabels[task.status]}
            leading={<TaskStatusIcon status={task.status} />}
            trailing={
              task.dueDate ? (
                <DueChip value={task.dueDate} />
              ) : (
                <Text className="text-xs text-muted-foreground">Unscheduled</Text>
              )
            }
            onPress={() =>
              onOpenRecord({ kind: "task", id: task.entityId, projectId: task.projectEntityId })
            }
          />
        ))}
      </SectionQuery>
      {creating ? (
        <FollowUpForm scope={scope} entityId={entityId} onClose={() => setCreating(false)} />
      ) : null}
    </DetailSection>
  );
}

function FollowUpForm({
  scope,
  entityId,
  onClose,
}: {
  scope: QueryScope;
  entityId: string;
  onClose: () => void;
}) {
  const projects = useQuery(recordQueries.projects(scope));
  const write = useCrmWrite(scope);
  const [requestId] = useState(newRequestId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [consent, setConsent] = useState(false);
  return (
    <FormSheet
      title="New follow-up"
      description="Creates a task in an existing project and links it back to this record. No email or invitation is sent."
      saveLabel="Create"
      dirty={!!(title || description || projectId || due)}
      pending={write.isPending}
      canSave={!!title.trim() && !!projectId && consent && dateFieldValid(due)}
      error={write.error ?? projects.error}
      onClose={onClose}
      onSave={() => {
        if (!projectId || !consent) return;
        write.mutate(
          {
            action: "createFollowUp",
            entityId,
            requestId,
            projectEntityId: projectId,
            title: title.trim(),
            description,
            dueDate: due || null,
            consentToTaskAudience: true,
          },
          { onSuccess: onClose },
        );
      }}
    >
      <TextField label="Title" value={title} onChange={setTitle} maxLength={300} autoFocus />
      <SelectField
        label="Project"
        value={projectId}
        onChange={setProjectId}
        placeholder={projects.isPending ? "Loading projects…" : "Choose a project"}
        choices={(projects.data ?? []).map((project) => ({
          value: project.entityId,
          label: project.name,
        }))}
        loading={projects.isPending}
      />
      <DateField
        label="Due date"
        value={due}
        onChange={setDue}
        description="No date means unscheduled."
      />
      <TextField
        label="Description"
        value={description}
        onChange={setDescription}
        multiline
        maxLength={20000}
      />
      <SwitchField
        label="Share with the project's readers"
        description="I approve sharing this task's title and description with the selected project's readers, who may not have access to this record."
        checked={consent}
        onChange={setConsent}
      />
    </FormSheet>
  );
}
