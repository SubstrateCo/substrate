import { Button } from "../primitives/button";
import type { ReferenceKind } from "./reference-picker";
import { CircleCheck, FolderKanban, UserRound } from "lucide-react";

export function ReferencePickerOption({
  id,
  kind,
  title,
  selected,
  onSelect,
}: {
  id: string;
  kind: ReferenceKind;
  title: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = { task: CircleCheck, project: FolderKanban, person: UserRound }[kind];
  return (
    <Button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      variant={selected ? "secondary" : "ghost"}
      className="w-full justify-start"
      onClick={onSelect}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{title}</span>
    </Button>
  );
}
