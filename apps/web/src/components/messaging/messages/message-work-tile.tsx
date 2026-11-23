import { Link } from "@tanstack/react-router";

import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import type { MessageWorkLink } from "./message-work";
import { entityKinds } from "@/components/context/entity-kinds";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { Unlink } from "lucide-react";

/** One linked record: status or kind icon, title, status label, and unlink on hover. */
export function MessageWorkTile({
  link,
  removing,
  onRemove,
}: {
  link: MessageWorkLink;
  removing: boolean;
  onRemove?: (id: string) => void;
}) {
  if (link.unavailable)
    return (
      <li className="flex h-8 items-center rounded-md border px-3 text-sm text-muted-foreground">
        Unavailable record · app disabled
      </li>
    );
  const meta = [link.statusName, link.purpose === "source" ? "Created here" : null]
    .filter(Boolean)
    .join(" · ");
  const Icon = entityKinds[link.entityType].icon;
  return (
    <li className="group/work flex h-8 min-w-0 items-center gap-1 rounded-md border bg-card pr-1 text-sm transition-colors hover:bg-row-hover">
      <Link
        {...link.link}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pl-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {link.entityType === "task" && link.status ? (
          <TaskStatusIcon status={link.status} />
        ) : (
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span title={link.title} className="min-w-0 truncate font-medium">
          {link.title}
        </span>
        {meta && (
          <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{meta}</span>
        )}
      </Link>
      {link.canRemove && onRemove && (
        <span className="flex opacity-0 group-focus-within/work:opacity-100 group-hover/work:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Unlink ${link.title}`}
                disabled={removing}
                onClick={() => onRemove(link.entityId)}
              >
                <Unlink aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Unlink</TooltipContent>
          </Tooltip>
        </span>
      )}
    </li>
  );
}
