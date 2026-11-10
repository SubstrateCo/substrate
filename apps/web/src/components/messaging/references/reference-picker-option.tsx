import type { TaskStatus } from "@startup-os/contracts/tasks";

import { Button } from "../../ui/button";
import type { ReferenceKind } from "./reference-picker";
import { plainReferenceText } from "./reference-token";
import { PersonAvatar } from "@/components/people/person-avatar";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { FolderKanban, Hash, ListTodo, MessagesSquare, UserRound } from "lucide-react";

export function ReferencePickerOption({
  id,
  kind,
  title,
  description,
  status,
  selected,
  onSelect,
}: {
  id: string;
  kind: ReferenceKind;
  title: string;
  description?: string;
  /** Tasks only: replaces the kind icon. */
  status?: TaskStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = {
    task: ListTodo,
    project: FolderKanban,
    person: UserRound,
    agent: UserRound,
    channel: Hash,
    thread: MessagesSquare,
  }[kind];
  let icon = <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  if (status) icon = <TaskStatusIcon status={status} />;
  if (kind === "person" || kind === "agent")
    icon = <PersonAvatar name={title} agent={kind === "agent"} size="xs" />;
  return (
    <Button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      variant={selected ? "secondary" : "ghost"}
      size={description ? "selection" : "default"}
      className="w-full justify-start"
      onClick={onSelect}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="min-w-0 text-left">
          <span className="block truncate">{plainReferenceText(title)}</span>
          {description && (
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {description}
            </span>
          )}
        </span>
      </span>
    </Button>
  );
}
