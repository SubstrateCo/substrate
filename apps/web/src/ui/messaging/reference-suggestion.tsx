import type { ReferenceSuggestion as Suggestion } from "@/ui/messaging/reference-popover/reference-results";
import { cva } from "class-variance-authority";
import { CircleCheck, FolderKanban, UserRound } from "lucide-react";

const optionVariants = cva("flex cursor-pointer items-center gap-3 rounded-md px-2 py-2", {
  variants: { selected: { true: "bg-accent text-accent-foreground", false: "" } },
});
const iconVariants = cva(
  "flex size-8 shrink-0 items-center justify-center bg-muted text-muted-foreground",
  { variants: { kind: { person: "rounded-full", task: "rounded-md", project: "rounded-md" } } },
);

export function ReferenceSuggestion({
  item,
  id,
  selected,
  onHighlight,
  onSelect,
}: {
  item: Suggestion;
  id: string;
  selected: boolean;
  onHighlight: () => void;
  onSelect: () => void;
}) {
  const Icon = { person: UserRound, task: CircleCheck, project: FolderKanban }[item.kind];
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      onPointerMove={onHighlight}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      className={optionVariants({ selected })}
    >
      <span className={iconVariants({ kind: item.kind })}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        {item.description && (
          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
        )}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {{ person: "User", task: "Task", project: "Project" }[item.kind]}
      </span>
    </div>
  );
}
