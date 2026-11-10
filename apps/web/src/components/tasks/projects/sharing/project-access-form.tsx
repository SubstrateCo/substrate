import { useState } from "react";

import { TaskAssigneeAvatar } from "../../task-cues/task-assignee-avatar";
import { TaskSelect } from "../../task-select";
import { projectPermissionOptions, type ProjectDetail, type ProjectPermission } from "../../types";
import { FormMessage } from "@/components/auth/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Check } from "lucide-react";

/** Choose a workspace person and a level. Sharing happens only when the person confirms. */
export function ProjectAccessForm({
  detail,
  pending,
  error,
  onShare,
  onCancel,
}: {
  detail: ProjectDetail;
  pending: boolean;
  error?: Error | null;
  onShare: (actorEntityId: string, name: string, level: ProjectPermission) => void;
  onCancel: () => void;
}) {
  const [actorEntityId, setActorEntityId] = useState("");
  const [level, setLevel] = useState<ProjectPermission>("edit");
  // Agents use their owner's access, so only people can be shared with.
  const available = detail.actors.filter(
    (actor) =>
      actor.type === "human" &&
      !detail.members.some((member) => member.actorEntityId === actor.entityId),
  );
  const actor = available.find((candidate) => candidate.entityId === actorEntityId);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (actor && !pending) onShare(actor.entityId, actor.name, level);
      }}
    >
      <DialogBody>
        <fieldset disabled={pending} className="grid min-w-0 gap-4">
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
                      onSelect={() => setActorEntityId(candidate.entityId)}
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
            onChange={setLevel}
            options={projectPermissionOptions}
          />
          <p className="text-sm text-muted-foreground">
            {actor
              ? `${actor.name} will see every task, subtask, and comment in ${detail.project.name}. Their agents get the same access.`
              : "Choose a person in this workspace. Their agents get the same access."}
          </p>
          <FormMessage error={error} errorDescription="Couldn’t share this project. Try again." />
        </fieldset>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <PendingButton disabled={!actor} pending={pending} pendingLabel="Sharing.">
          Share project
        </PendingButton>
      </DialogFooter>
    </form>
  );
}
