import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useId } from "react";

import { FormMessage } from "../../../auth/form-message";
import { PendingButton } from "../../../feedback/pending-button";
import { Button } from "../../../ui/button";
import { Field, FieldError, FieldLabel } from "../../../ui/field";
import { Input } from "../../../ui/input";
import { Textarea } from "../../../ui/textarea";
import { projectFormSchema } from "../../editor/task-form-validation";
import type { Project } from "../../types";

export function ProjectForm({
  project,
  onSubmit,
  onCancel,
  pending = false,
  error,
}: {
  project?: Project;
  onSubmit: (draft: { name: string; description: string }) => void;
  onCancel: () => void;
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
  const submitLabel = project ? "Save project" : "Create project";
  return (
    <form
      noValidate
      className="mx-auto w-full max-w-xl min-w-0 space-y-5 p-4 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending) void form.handleSubmit();
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <h2 className="text-lg font-semibold">{project ? "Edit project" : "New project"}</h2>
        <p className="text-sm text-muted-foreground">
          Projects start private. Share a project to give others access to all its tasks.
        </p>
        <form.Field name="name">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor={`${id}-name`}>Project name</FieldLabel>
              <Input
                id={`${id}-name`}
                autoFocus
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  if (!field.state.meta.isValid) void field.validate("blur");
                }}
                onBlur={field.handleBlur}
                aria-required
                aria-invalid={!field.state.meta.isValid}
                aria-describedby={!field.state.meta.isValid ? `${id}-name-error` : undefined}
                maxLength={200}
              />
              <FieldError id={`${id}-name-error`} errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor={`${id}-description`}>Project description</FieldLabel>
              <Textarea
                id={`${id}-description`}
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  if (!field.state.meta.isValid) void field.validate("blur");
                }}
                onBlur={field.handleBlur}
                aria-invalid={!field.state.meta.isValid}
                aria-describedby={!field.state.meta.isValid ? `${id}-description-error` : undefined}
                maxLength={20000}
              />
              <FieldError id={`${id}-description-error`} errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <FormMessage error={error} />
        <div className="flex flex-wrap gap-2">
          <PendingButton pending={pending} pendingLabel="Saving project…">
            {submitLabel}
          </PendingButton>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
