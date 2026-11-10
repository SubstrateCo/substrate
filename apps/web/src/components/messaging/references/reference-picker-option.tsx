import type { TaskStatus } from "@startup-os/contracts/tasks";

import { Button } from "../../ui/button";
import type { ReferenceKind } from "./reference-picker";
import { plainReferenceText } from "./reference-token";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { Bot, FolderKanban, Hash, ListTodo, MessagesSquare, UserRound } from "lucide-react";

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
    agent: Bot,
    channel: Hash,
    thread: MessagesSquare,
  }[kind];
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
        {status ? (
          <TaskStatusIcon status={status} />
        ) : (
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        )}
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
