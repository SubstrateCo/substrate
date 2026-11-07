import { useState } from "react";

import { TaskSelect } from "../../task-select";
import type { ProjectDetail, ProjectPermission } from "../../types";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, UserRound } from "lucide-react";

export function ProjectAccessForm({
  detail,
  onReview,
  onCancel,
}: {
  detail: ProjectDetail;
  onReview: (actorEntityId: string, name: string, level: ProjectPermission) => void;
  onCancel: () => void;
}) {
  const [actorEntityId, setActorEntityId] = useState("");
  const [level, setLevel] = useState<ProjectPermission>("edit");
  const available = detail.actors.filter(
    (actor) =>
      actor.type === "human" &&
      !detail.members.some((member) => member.actorEntityId === actor.entityId),
  );
  const actor = available.find((candidate) => candidate.entityId === actorEntityId);
  return (
    <form
      className="min-w-0 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (actor) onReview(actor.entityId, actor.name, level);
      }}
    >
      <Command>
        <CommandInput aria-label="Search people" placeholder="Search workspace people…" />
        <CommandList>
          <CommandEmpty>No other workspace people available.</CommandEmpty>
          <CommandGroup heading="Available in this workspace">
            {available.map((candidate) => (
              <CommandItem
                key={candidate.entityId}
                value={`${candidate.name} ${candidate.entityId}`}
                onSelect={() => setActorEntityId(candidate.entityId)}
              >
                <UserRound aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                {candidate.entityId === actorEntityId && <Check aria-hidden="true" />}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      {actor && <p className="text-sm">Selected: {actor.name}</p>}
      <TaskSelect
        label="Permission"
        value={level}
        onChange={setLevel}
        options={[
          { value: "view", label: "View" },
          { value: "comment", label: "Comment" },
          { value: "edit", label: "Edit" },
          { value: "owner", label: "Owner" },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        Choose an existing workspace person. This does not invite external users or grant access
        across workspaces.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!actor}>Review access</Button>
      </div>
    </form>
  );
}
