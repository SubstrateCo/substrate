import { Link } from "@tanstack/react-router";

import type { MessageWorkLink } from "./message-work";
import { entityKinds } from "@/components/context/entity-kinds";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LockKeyhole, Unlink } from "lucide-react";

/**
 * One linked record in a line: status or kind icon, title, and status label. Unlink appears in
 * the gap after the record on hover or focus, so it takes no space and moves nothing.
 */
export function MessageWorkItem({
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
      <li className="flex items-start gap-1.5 text-sm/6 text-muted-foreground">
        <span className="flex h-6 items-center">
          <LockKeyhole aria-hidden="true" className="size-3.5" />
        </span>
        Unavailable record · app disabled
      </li>
    );
  const Icon = entityKinds[link.entityType].icon;
  return (
    <li className="group/work relative flex min-w-0">
      <Link
        {...link.link}
        className="flex min-w-0 items-start gap-1.5 rounded-sm text-sm/6 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="flex h-6 shrink-0 items-center">
          {link.entityType === "task" && link.status ? (
            <TaskStatusIcon status={link.status} className="size-3.5" />
          ) : (
            <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 wrap-anywhere">
          <span className="font-medium group-hover/work:underline">{link.title}</span>
          {link.statusName && (
            <>
              {" "}
              <span className="text-xs text-muted-foreground">{link.statusName}</span>
            </>
          )}
        </span>
      </Link>
      {link.canRemove && onRemove && (
        <span className="absolute top-0.5 left-full flex opacity-0 group-focus-within/work:opacity-100 group-hover/work:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="size-5"
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
