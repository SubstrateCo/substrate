import type { ReactElement, ReactNode } from "react";

import type { ProjectDetail } from "../types";
import { ActorAvatar } from "@/components/people/actor-avatar";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { actorIdentity } from "@/lib/actors/identity";

type Actor = ProjectDetail["actors"][number];
type Option = { value: string | null; label: string; actor?: Actor };
type Group = { value: string; label?: string; items: Option[] };

const unassigned: Option = { value: null, label: "Unassigned" };

/**
 * A searchable list of people and agents. `trigger` is the button element, without children;
 * `children` is its content. The trigger adds the chevron.
 */
export function AssigneePicker({
  value,
  assignees,
  onChange,
  trigger,
  children,
}: {
  value: string | null;
  /** Who can be chosen now. */
  assignees: readonly Actor[];
  onChange: (value: string | null) => void;
  trigger: ReactElement;
  children: ReactNode;
}) {
  const option = (actor: Actor): Option => ({ value: actor.entityId, label: actor.name, actor });
  const people = assignees.filter((actor) => actor.type === "human").map(option);
  const agents = assignees.filter((actor) => actor.type === "agent").map(option);
  const groups: Group[] = [
    { value: "unassigned", items: [unassigned] },
    { value: "people", label: "People", items: people },
    { value: "agents", label: "Agents", items: agents },
  ].filter((group) => group.items.length > 0);
  const current = [...people, ...agents].find((candidate) => candidate.value === value);
  return (
    <Combobox
      items={groups}
      value={value ? (current ?? { value, label: "" }) : unassigned}
      onValueChange={(next) => {
        const chosen = next?.value ?? null;
        if (chosen !== value) onChange(chosen);
      }}
      isItemEqualToValue={(item, chosen) => item.value === chosen.value}
    >
      <ComboboxTrigger render={trigger}>{children}</ComboboxTrigger>
      <ComboboxContent>
        <ComboboxSearch aria-label="Search assignees" placeholder="Assign to" />
        <ComboboxEmpty>No one matches.</ComboboxEmpty>
        <ComboboxList>
          {(group: Group) => (
            <ComboboxGroup key={group.value} items={group.items}>
              {group.label && <ComboboxLabel>{group.label}</ComboboxLabel>}
              <ComboboxCollection>
                {(item: Option) => (
                  <ComboboxItem key={item.value ?? "unassigned"} value={item}>
                    <ActorAvatar actor={item.actor && actorIdentity(item.actor)} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
