import { Checkbox } from "../../ui/checkbox";
import { CommandItem } from "../../ui/command";
import { cn } from "cn";
import { FolderKanban, ListTodo } from "lucide-react";

export function LinkWorkItem({
  id,
  kind,
  title,
  projectName,
  chosen,
  linked,
  disabled,
  onChoose,
}: {
  id: string;
  kind: "task" | "project";
  title: string;
  projectName?: string;
  chosen: boolean;
  linked: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const Icon = kind === "task" ? ListTodo : FolderKanban;
  const selected = chosen && !linked;
  let subtitle = "Project";
  if (kind === "task") subtitle = projectName ? `Task · ${projectName}` : "Task";
  return (
    <CommandItem value={id} disabled={disabled || linked} onSelect={onChoose}>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
          selected && "bg-primary/10 text-primary",
        )}
      >
        <Icon aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 font-medium wrap-anywhere">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      {linked ? (
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          Linked
        </span>
      ) : (
        <Checkbox
          aria-hidden="true"
          tabIndex={-1}
          checked={selected}
          className="pointer-events-none"
        />
      )}
      {selected && <span className="sr-only">Selected</span>}
    </CommandItem>
  );
}
