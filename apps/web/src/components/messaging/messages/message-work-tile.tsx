import { Button } from "../../ui/button";
import type { MessageWorkLink } from "./message-work";
import { ArrowUpRight, CircleCheck, FolderKanban, Unlink } from "lucide-react";

export function MessageWorkTile({
  link,
  removing,
  onRemove,
}: {
  link: MessageWorkLink;
  removing: boolean;
  onRemove?: (id: string) => void;
}) {
  const Icon = link.entityType === "task" ? CircleCheck : FolderKanban;
  return (
    <div className="flex min-w-0 flex-wrap items-center rounded-lg border bg-card text-card-foreground shadow-surface">
      <div className="flex min-w-0 grow basis-48 items-center gap-3 p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{link.entityType === "task" ? "Task" : "Project"}</span>
            <span>·</span>
            <span>{link.purpose === "source" ? "Created here" : "Linked work"}</span>
          </span>
          <span className="block text-sm font-medium wrap-anywhere">{link.title}</span>
          {link.statusName && (
            <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
              {link.statusName}
            </span>
          )}
        </span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1 p-2">
        <Button asChild size="icon-xs" variant="ghost">
          <a href={link.href} aria-label={`Open ${link.title}`} title={`Open ${link.entityType}`}>
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
        </Button>
        {link.canRemove && onRemove && (
          <Button
            type="button"
            size="icon-xs"
            variant="destructive"
            aria-label={`Unlink ${link.title}`}
            title="Unlink work"
            disabled={removing}
            onClick={() => onRemove(link.entityId)}
          >
            <Unlink aria-hidden="true" className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
