import type { SaveSkillInput } from "@startup-os/contracts/agents";
import { saveSkillInput } from "@startup-os/contracts/agents";
import type { HarnessSkill } from "@startup-os/contracts/harness";

import { useForm } from "@tanstack/react-form";

import { useState } from "react";

import { EditorDialog } from "./editor-dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { z } from "zod";

const skillFields = saveSkillInput.omit({ id: true }).extend({
  name: z
    .string()
    .trim()
    .min(1, "Enter a skill name.")
    .max(64, "Use a skill name of 64 characters or fewer.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase words separated by hyphens for the skill name.",
    ),
});

export function SkillEditor({
  skill,
  pending,
  onClose,
  onSave,
}: {
  skill?: HarnessSkill;
  pending: boolean;
  onClose: () => void;
  onSave: (input: SaveSkillInput) => Promise<void>;
}) {
  const [error, setError] = useState<string>();
  const form = useForm({
    defaultValues: {
      name: skill?.name ?? "",
      description: skill?.description ?? "",
      content: skill?.content ?? "",
    },
    validators: { onChange: skillFields, onBlur: skillFields, onSubmit: skillFields },
    onSubmit: async ({ value }) => {
      if (pending) return;
      setError(undefined);
      const parsed = skillFields.parse(value);
      try {
        await onSave(skill?.id ? { ...parsed, id: skill.id } : parsed);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save changes.");
      }
    },
  });
  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.submissionAttempts] as const}>
      {([isSubmitting, submissionAttempts]) => (
        <EditorDialog
          title={skill ? "Edit skill" : "Create skill"}
          saveLabel="Save skill"
          description="Native skill"
          pending={pending || isSubmitting}
          onClose={onClose}
          onSubmit={() => form.handleSubmit()}
          error={error}
        >
          <form.Field name="name">
            {(field) => {
              const invalid =
                (field.state.meta.isBlurred || submissionAttempts > 0) && !field.state.meta.isValid;
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor="skill-name">Skill name</FieldLabel>
                  <Input
                    id="skill-name"
                    required
                    maxLength={64}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? "skill-name-error" : undefined}
                  />
                  {invalid && <FieldError id="skill-name-error" errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="description">
            {(field) => {
              const invalid =
                (field.state.meta.isBlurred || submissionAttempts > 0) && !field.state.meta.isValid;
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor="skill-description">Description</FieldLabel>
                  <Textarea
                    id="skill-description"
                    maxLength={2000}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? "skill-description-error" : undefined}
                  />
                  {invalid && (
                    <FieldError id="skill-description-error" errors={field.state.meta.errors} />
                  )}
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="content">
            {(field) => {
              const invalid =
                (field.state.meta.isBlurred || submissionAttempts > 0) && !field.state.meta.isValid;
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor="skill-content">Skill content</FieldLabel>
                  <Textarea
                    id="skill-content"
                    rows={10}
                    maxLength={100000}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? "skill-content-error" : undefined}
                  />
                  {invalid && (
                    <FieldError id="skill-content-error" errors={field.state.meta.errors} />
                  )}
                </Field>
              );
            }}
          </form.Field>
        </EditorDialog>
      )}
    </form.Subscribe>
  );
}
