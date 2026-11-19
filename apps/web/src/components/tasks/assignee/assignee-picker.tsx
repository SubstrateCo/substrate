import { useState, type ReactNode } from "react";

import { TaskAssigneeAvatar } from "../task-cues/task-assignee-avatar";
import type { ProjectDetail } from "../types";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check } from "lucide-react";

type Actor = ProjectDetail["actors"][number];

/**
 * A searchable list of people and agents. `children` renders the trigger, which must forward its
 * props to a button.
 */
export function AssigneePicker({
  value,
  assignees,
  onChange,
  children,
}: {
  value: string | null;
  /** Who can be chosen now. */
  assignees: readonly Actor[];
  onChange: (value: string | null) => void;
  children: (props: { open: boolean }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const people = assignees.filter((actor) => actor.type === "human");
  const agents = assignees.filter((actor) => actor.type === "agent");
  const choose = (next: string | null) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };
  const row = (actor: Actor) => (
    <CommandItem
      key={actor.entityId}
      value={`${actor.name} ${actor.entityId}`}
      onSelect={() => choose(actor.entityId)}
    >
      <TaskAssigneeAvatar name={actor.name} image={actor.image} type={actor.type} />
      <span className="min-w-0 flex-1 truncate">{actor.name}</span>
      {actor.entityId === value && <Check aria-hidden="true" />}
    </CommandItem>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children({ open })}</PopoverTrigger>
      <PopoverContent variant="menu" align="start" className="w-64">
        <Command>
          <CommandInput aria-label="Search assignees" placeholder="Assign to…" />
          <CommandList className="mt-1">
            <CommandEmpty>No one matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="Unassigned" onSelect={() => choose(null)}>
                <TaskAssigneeAvatar />
                <span className="flex-1">Unassigned</span>
                {!value && <Check aria-hidden="true" />}
              </CommandItem>
            </CommandGroup>
            {!!people.length && <CommandGroup heading="People">{people.map(row)}</CommandGroup>}
            {!!agents.length && <CommandGroup heading="Agents">{agents.map(row)}</CommandGroup>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
