import type { PermissionLevel } from "@substrate/contracts/tasks";
import { grantCandidates, type ProjectGrant } from "@substrate/contracts/tasks/project-access";

import { revalidateLogic, useForm, useSelector } from "@tanstack/react-form";

import type { ReactNode } from "react";

import { projectPermissionOptions, type ProjectDetail } from "../../types";
import type { FormDialogEditor } from "@/components/feedback/form-dialog";
import { SelectField } from "@/components/forms/select-field";
import { PersonField } from "@/components/people/person-field";
import { z } from "zod";

export function ProjectAccessForm({
  detail,
  pending,
  error,
  onShare,
  renderDialog,
}: {
  detail: ProjectDetail;
  pending: boolean;
  error?: Error | null;
  onShare: (actorEntityId: string, name: string, level: PermissionLevel) => void;
  renderDialog: (editor: FormDialogEditor) => ReactNode;
}) {
  const available = grantCandidates(detail);
  const defaultValues: ProjectGrant = {
    actorEntityId: "",
    level: "edit",
  };
  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: {
      onDynamic: z.object({
        actorEntityId: z
          .string()
          .refine(
            (id) => available.some((candidate) => candidate.entityId === id),
            "Choose a person.",
          ),
        level: z.enum(projectPermissionOptions.map((option) => option.value)),
      }),
    },
    onSubmit: ({ value }) => {
      const actor = available.find((candidate) => candidate.entityId === value.actorEntityId);
      if (actor && !pending) onShare(actor.entityId, actor.name, value.level);
    },
  });
  const { actorEntityId, level } = useSelector(form.store, (state) => state.values);
  const actor = available.find((candidate) => candidate.entityId === actorEntityId);
  const people = available.map((candidate) => ({
    id: candidate.entityId,
    name: candidate.name,
    image: candidate.image,
  }));
  return renderDialog({
    pending,
    disabled: !actor,
    error,
    errorDescription: "Couldn’t share this project. Try again.",
    onSubmit: () => form.handleSubmit(),
    fields: (
      <>
        <PersonField
          people={people}
          value={actorEntityId}
          onChange={(next) => form.setFieldValue("actorEntityId", next)}
          description={
            actor
              ? `${actor.name} will see every task, subtask, and comment in ${detail.project.name}. Their agents get the same access.`
              : "Choose a person in this workspace. Their agents get the same access."
          }
        />
        <SelectField
          label="Access"
          value={level}
          onChange={(value) => form.setFieldValue("level", value)}
          options={projectPermissionOptions}
        />
      </>
    ),
  });
}
