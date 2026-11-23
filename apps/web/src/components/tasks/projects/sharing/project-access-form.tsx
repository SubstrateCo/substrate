import type { PermissionLevel } from "@substrate/contracts/tasks";

import { revalidateLogic, useForm, useSelector } from "@tanstack/react-form";

import { useId, type ReactNode } from "react";

import { projectPermissionOptions, type ProjectDetail } from "../../types";
import type { FormDialogEditor } from "@/components/feedback/form-dialog";
import { SelectField } from "@/components/forms/select-field";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { z } from "zod";

type ProjectAccessDraft = { actorEntityId: string; level: PermissionLevel };

/** Choose a workspace person and a level. Sharing happens only when the person confirms. */
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
  const id = useId();
  // Agents use their owner's access, so only people can be shared with.
  const available = detail.actors.filter(
    (actor) =>
      actor.type === "human" &&
      !detail.members.some((member) => member.actorEntityId === actor.entityId),
  );
  const defaultValues: ProjectAccessDraft = {
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
    value: candidate.entityId,
    label: candidate.name,
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
        <Field>
          <FieldLabel htmlFor={`${id}-person`}>Person</FieldLabel>
          <Combobox
            items={people}
            value={people.find((person) => person.value === actorEntityId) ?? null}
            onValueChange={(next) => form.setFieldValue("actorEntityId", next?.value ?? "")}
            isItemEqualToValue={(item, chosen) => item.value === chosen.value}
          >
            <ComboboxTrigger
              render={<Button id={`${id}-person`} type="button" variant="field" role="combobox" />}
            >
              {actor ? (
                <>
                  <PersonAvatar size="xs" name={actor.name} image={actor.image} />
                  <span className="min-w-0 flex-1 truncate text-left">{actor.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Choose a person</span>
              )}
            </ComboboxTrigger>
            <ComboboxContent>
              <ComboboxSearch aria-label="Search people" placeholder="Search people" />
              <ComboboxEmpty>No one else in this workspace.</ComboboxEmpty>
              <ComboboxList>
                {(person: (typeof people)[number]) => (
                  <ComboboxItem key={person.value} value={person}>
                    <PersonAvatar size="xs" name={person.label} image={person.image} />
                    <span className="min-w-0 flex-1 truncate">{person.label}</span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <FieldDescription>
            {actor
              ? `${actor.name} will see every task, subtask, and comment in ${detail.project.name}. Their agents get the same access.`
              : "Choose a person in this workspace. Their agents get the same access."}
          </FieldDescription>
        </Field>
        <SelectField
          label="Permission"
          value={level}
          onChange={(value) => form.setFieldValue("level", value)}
          options={projectPermissionOptions}
        />
      </>
    ),
  });
}
