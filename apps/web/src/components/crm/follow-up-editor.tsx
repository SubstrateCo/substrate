import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { formText } from "./form-text";
import { FormDialog } from "@/components/feedback/form-dialog";
import { DateField } from "@/components/forms/date-field";
import { NativeField } from "@/components/forms/native-form";
import { SelectField } from "@/components/forms/select-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { resourceState } from "@/lib/resource-state";
import { useCrmMutation } from "@/queries/crm/mutations";
import { projectsQueryOptions } from "@/queries/tasks/options";

export function FollowUpEditor({ entityId, onClose }: { entityId: string; onClose: () => void }) {
  const { organizationId } = useWorkspaceScope();
  const projects = useQuery(projectsQueryOptions(organizationId));
  const mutation = useCrmMutation(organizationId);
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [consent, setConsent] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <FormDialog
      title="New follow-up"
      description="Create a task in an existing project. It links back to this customer record. No email or calendar invitation is sent."
      saveLabel="Create follow-up"
      nativeValidation
      disabled={!projectId || !consent}
      pending={mutation.isPending}
      error={projects.error ?? mutation.error}
      errorDescription="Couldn’t create this follow-up. Check your project access and try again."
      onClose={onClose}
      onSubmit={(form) => {
        if (!projectId || !consent) return;
        mutation.mutate(
          {
            action: "createFollowUp",
            organizationId,
            entityId,
            projectEntityId: projectId,
            requestId,
            title: formText(form, "title"),
            description: formText(form, "description"),
            dueDate: dueDate || null,
            consentToTaskAudience: true,
          },
          { onSuccess: onClose },
        );
      }}
    >
      <NativeField
        id="followup-title"
        name="title"
        label="Title"
        maxLength={300}
        required
        missingMessage="Enter a follow-up title."
      />
      <SelectField
        label="Project"
        value={projectId}
        onChange={setProjectId}
        options={[
          { value: "", label: "None" },
          ...(resourceState(projects).data ?? []).map((project) => ({
            value: project.entityId,
            label: project.name,
          })),
        ]}
      />
      <DateField
        label="Due date"
        value={dueDate}
        onChange={setDueDate}
        description="No date means unscheduled. Manage assignment and completion in the task."
      />
      <NativeField
        id="followup-description"
        name="description"
        label="Description"
        multiline
        maxLength={20000}
      />
      <Field orientation="horizontal">
        <Checkbox
          id="followup-consent"
          checked={consent}
          onCheckedChange={(checked) => setConsent(checked === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor="followup-consent">
            I approve sharing this task’s title and description with the selected project’s readers,
            who may not have access to this customer record.
          </FieldLabel>
        </FieldContent>
      </Field>
    </FormDialog>
  );
}
