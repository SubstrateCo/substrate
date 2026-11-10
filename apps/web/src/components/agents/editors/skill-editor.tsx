import type { SaveSkillInput } from "@startup-os/contracts/agents";
import { saveSkillInput } from "@startup-os/contracts/agents";
import type { HarnessSkill } from "@startup-os/contracts/harness";

import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useState } from "react";

import { EditorDialog } from "./editor-dialog";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { FormTextField } from "@/components/forms/form-text-field";
import { z } from "zod";

const skillFields = saveSkillInput.omit({ id: true }).extend({
  name: z
    .string()
    .trim()
    .min(1, "Enter a skill name.")
    .max(64, "Use a skill name of 64 characters or fewer.")
    .refine(
      (value) => !value || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
      "Use lowercase words separated by hyphens for the skill name.",
    ),
});

const skillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Release notes" becomes "release-notes", so people can type words and get a valid name. */
function toSkillName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

/** The name an existing skill opens with: always one the editor accepts. */
function openingName(skill?: HarnessSkill) {
  if (!skill) return "";
  if (skillName.test(skill.name)) return skill.name;
  return skillName.test(skill.id) ? skill.id : toSkillName(skill.name);
}

const contentLimit = 100_000;

/** The format, and the length once it nears the limit. */
function contentHint(length: number) {
  const format = "Markdown: steps, examples, and links the agent should follow.";
  if (length < contentLimit * 0.8) return format;
  return `${format} ${length.toLocaleString("en-US")} of ${contentLimit.toLocaleString("en-US")} characters.`;
}

export function SkillEditor({
  skill,
  onClose,
  onSave,
  onRestoreFocus,
}: {
  skill?: HarnessSkill;
  onClose: () => void;
  onSave: (input: SaveSkillInput) => Promise<void>;
  onRestoreFocus?: () => void;
}) {
  const [error, setError] = useState<string>();
  const form = useForm({
    defaultValues: {
      name: openingName(skill),
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
        const fallback = "We couldn’t save this skill. Try again.";
        setError(cause instanceof Error ? actionErrorMessage(cause, fallback) : fallback);
      }
    },
  });
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <EditorDialog
          title={skill ? "Edit skill" : "New skill"}
          saveLabel={skill ? "Save skill" : "Create skill"}
          description="A skill is a short guide the agent opens when a task matches its description. It’s saved as a file in this agent’s folder on this desktop."
          pending={isSubmitting}
          onClose={onClose}
          onSubmit={() => form.handleSubmit()}
          error={error}
          onRestoreFocus={onRestoreFocus}
        >
          <form.Field name="name">
            {(field) => (
              <FormTextField
                // Blur turns "Release notes" into "release-notes" so the name is always valid.
                field={{
                  state: field.state,
                  handleChange: field.handleChange,
                  validate: field.validate,
                  handleBlur: () => {
                    const name = toSkillName(field.state.value);
                    if (name && name !== field.state.value) field.handleChange(name);
                    field.handleBlur();
                  },
                }}
                id="skill-name"
                label="Skill name"
                description="Words joined by hyphens, like release-notes. Other words are joined for you."
                placeholder="release-notes"
                required
                maxLength={64}
              />
            )}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <FormTextField
                field={field}
                id="skill-description"
                label="When to use it"
                description="The agent reads this to decide when the skill applies. Name the task and the trigger."
                placeholder="For example: Draft release notes from merged work when asked for a changelog."
                multiline
                rows={2}
                maxLength={2000}
              />
            )}
          </form.Field>
          <form.Field name="content">
            {(field) => (
              <FormTextField
                field={field}
                id="skill-content"
                label="Instructions"
                description={contentHint(field.state.value.length)}
                placeholder={
                  "# Release notes\n\n1. Collect merged work since the last release.\n2. Group changes by area."
                }
                multiline
                rows={12}
                className="field-sizing-fixed max-h-96 min-h-48 overflow-y-auto font-mono text-xs"
                maxLength={contentLimit}
              />
            )}
          </form.Field>
        </EditorDialog>
      )}
    </form.Subscribe>
  );
}
