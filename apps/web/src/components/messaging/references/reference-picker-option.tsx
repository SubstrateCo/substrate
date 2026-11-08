import { Button } from "../../ui/button";
import type { ReferenceKind } from "./reference-picker";
import { CircleCheck, FolderKanban, UserRound, Hash, MessagesSquare } from "lucide-react";

export function ReferencePickerOption({
  id,
  kind,
  title,
  description,
  selected,
  onSelect,
}: {
  id: string;
  kind: ReferenceKind;
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = {
    task: CircleCheck,
    project: FolderKanban,
    person: UserRound,
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
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 text-left">
        <span className="block truncate">{title.replace(/@\[[^\]]+\]/g, "[Reference]")}</span>
        {description && (
          <span className="block truncate text-xs text-muted-foreground">{description}</span>
        )}
      </span>
    </Button>
  );
}
