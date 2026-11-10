import type { SaveSkillInput } from "@startup-os/contracts/agents";
import { saveSkillInput } from "@startup-os/contracts/agents";
import type { HarnessSkill } from "@startup-os/contracts/harness";

import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useState } from "react";

import { EditorDialog } from "./editor-dialog";
import { FormTextField } from "@/components/forms/form-text-field";
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
  onClose,
  onSave,
}: {
  skill?: HarnessSkill;
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
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    validators: { onDynamic: skillFields },
    onSubmit: async ({ value }) => {
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
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <EditorDialog
          title={skill ? "Edit skill" : "Create skill"}
          saveLabel="Save skill"
          description="Native skill"
          pending={isSubmitting}
          onClose={onClose}
          onSubmit={() => form.handleSubmit()}
          error={error}
        >
          <form.Field name="name">
            {(field) => (
              <FormTextField
                field={field}
                id="skill-name"
                label="Skill name"
                required
                maxLength={64}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            )}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <FormTextField
                field={field}
                id="skill-description"
                label="Description"
                multiline
                maxLength={2000}
              />
            )}
          </form.Field>
          <form.Field name="content">
            {(field) => (
              <FormTextField
                field={field}
                id="skill-content"
                label="Skill content"
                multiline
                rows={10}
                maxLength={100000}
              />
            )}
          </form.Field>
        </EditorDialog>
      )}
    </form.Subscribe>
  );
}
