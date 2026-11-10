import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useId } from "react";

import { FormMessage } from "../../../auth/form-message";
import { PendingButton } from "../../../feedback/pending-button";
import { Button } from "../../../ui/button";
import { projectFormSchema } from "../../editor/task-form-validation";
import type { Project } from "../../types";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { FormTextField } from "@/components/forms/form-text-field";
import { SettingsCard, SettingsFooter } from "@/components/layout/settings-section";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";

/**
 * A new project's name and description inside a dialog, or an existing project's details as a
 * settings card.
 */
export function ProjectForm({
  project,
  onSubmit,
  onCancel,
  pending = false,
  error,
}: {
  project?: Project;
  onSubmit: (draft: { name: string; description: string }) => void;
  onCancel?: () => void;
  pending?: boolean;
  error?: Error | null;
}) {
  const id = useId();
  const form = useForm({
    defaultValues: { name: project?.name ?? "", description: project?.description ?? "" },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    validators: { onDynamic: projectFormSchema },
    onSubmit: ({ value }) => {
      if (!pending) onSubmit(value);
    },
  });
  const fields = (
    <fieldset disabled={pending} className="grid min-w-0 gap-4">
      <form.Field name="name">
        {(field) => (
          <FormTextField
            field={field}
            id={`${id}-name`}
            label="Project name"
            autoFocus={!project}
            aria-required
            maxLength={200}
          />
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <FormTextField
            field={field}
            id={`${id}-description`}
            label="Project description"
            multiline
            maxLength={20000}
          />
        )}
      </form.Field>
      <FormMessage error={error} />
    </fieldset>
  );
  const onFormSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!pending) void form.handleSubmit();
  };
  if (!project)
    return (
      <form noValidate aria-label="New project" onSubmit={onFormSubmit}>
        <DialogBody>{fields}</DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <PendingButton pending={pending} pendingLabel="Creating project.">
            Create project
          </PendingButton>
        </DialogFooter>
      </form>
    );
  return (
    <form noValidate aria-label="Project details" onSubmit={onFormSubmit}>
      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const dirty = values.name !== project.name || values.description !== project.description;
          return (
            <>
              <ProjectDraftGuard dirty={dirty} projectId={project.entityId} />
              <SettingsCard
                title="Project details"
                description="The name and description everyone with access sees."
                footer={
                  <SettingsFooter
                    dirty={dirty}
                    pending={pending}
                    onDiscard={() =>
                      form.reset({ name: project.name, description: project.description })
                    }
                  />
                }
              >
                {fields}
              </SettingsCard>
            </>
          );
        }}
      </form.Subscribe>
    </form>
  );
}

function ProjectDraftGuard({ dirty, projectId }: { dirty: boolean; projectId: string }) {
  return (
    <UnsavedChangesGuard
      dirty={dirty}
      description="Your project details aren’t saved."
      name="Project details"
      shouldBlock={({ next, current }) => {
        if (
          next.routeId !== "/_authenticated/_frame/_workspace/tasks/" ||
          current.routeId !== "/_authenticated/_frame/_workspace/tasks/"
        )
          return true;
        return (
          (next.search.projectId ?? current.search.projectId) !== projectId ||
          next.search.workspaceId !== current.search.workspaceId
        );
      }}
    />
  );
}
