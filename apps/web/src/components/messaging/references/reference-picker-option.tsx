import type { TaskStatus } from "@substrate/contracts/tasks";
/* oxlint-disable shadcn/no-restyle -- Picker candidates need a neutral cursor and wrapping context, not a button's selected state. */

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
  image,
  description,
  status,
  selected,
  onFocus,
  onSelect,
}: {
  id: string;
  kind: ReferenceKind;
  title: string;
  image?: string | null;
  description?: string;
  /** Tasks only: replaces the kind icon. */
  status?: TaskStatus;
  selected: boolean;
  onFocus: () => void;
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
    icon = <PersonAvatar name={title} image={image} agent={kind === "agent"} size="xs" />;
  return (
    <Button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      variant="ghost"
      size="default"
      tabIndex={selected ? 0 : -1}
      className={`h-auto w-full justify-start py-1.5 font-normal hover:bg-row-hover active:scale-100 ${selected ? "bg-row-highlight hover:bg-row-highlight" : ""}`}
      onFocus={onFocus}
      onClick={onSelect}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="flex min-w-0 flex-col items-start text-left">
          <span className="wrap-break-word">{plainReferenceText(title)}</span>
          {description && (
            <span className="text-xs font-normal wrap-break-word text-muted-foreground">
              {description}
            </span>
          )}
        </span>
      </span>
    </Button>
  );
}
