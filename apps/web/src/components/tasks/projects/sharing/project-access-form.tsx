import type { PermissionLevel } from "@substrate/contracts/tasks";

import { revalidateLogic, useForm, useSelector } from "@tanstack/react-form";

import type { ReactNode } from "react";

import { TaskAssigneeAvatar } from "../../task-cues/task-assignee-avatar";
import { TaskSelect } from "../../task-select";
import { projectPermissionOptions, type ProjectDetail } from "../../types";
import type { FormDialogEditor } from "@/components/feedback/form-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check } from "lucide-react";
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
  return renderDialog({
    pending,
    disabled: !actor,
    error,
    errorDescription: "Couldn’t share this project. Try again.",
    onSubmit: () => form.handleSubmit(),
    fields: (
      <>
        <div className="overflow-hidden rounded-lg border">
          <Command>
            <CommandInput aria-label="Search people" placeholder="Search people" />
            <CommandList className="max-h-56">
              <CommandEmpty>No one else in this workspace.</CommandEmpty>
              <CommandGroup>
                {available.map((candidate) => (
                  <CommandItem
                    key={candidate.entityId}
                    value={`${candidate.name} ${candidate.entityId}`}
                    onSelect={() => form.setFieldValue("actorEntityId", candidate.entityId)}
                  >
                    <TaskAssigneeAvatar name={candidate.name} image={candidate.image} />
                    <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                    {candidate.entityId === actorEntityId && <Check aria-hidden="true" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
        <TaskSelect
          label="Permission"
          value={level}
          onChange={(value) => form.setFieldValue("level", value)}
          options={projectPermissionOptions}
        />
        <p className="text-sm text-muted-foreground">
          {actor
            ? `${actor.name} will see every task, subtask, and comment in ${detail.project.name}. Their agents get the same access.`
            : "Choose a person in this workspace. Their agents get the same access."}
        </p>
      </>
    ),
  });
}
