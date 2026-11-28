import type { InteractionSourceEvent } from "@substrate/contracts/calendar";

import { Link } from "@tanstack/react-router";

import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { eventTitle } from "@/lib/calendar/days";
import { formatDateOnly } from "@/lib/format/date";
import { calendarLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { CalendarDays } from "lucide-react";

export function MeetingSourceLink({
  source,
  className,
}: {
  source: InteractionSourceEvent | undefined;
  className?: string;
}) {
  const { organizationId } = useWorkspaceScope();
  if (!source) return null;
  const title = eventTitle(source.title);
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <CalendarDays aria-hidden className="size-3 shrink-0" />
      <span className="shrink-0">From meeting:</span>
      <Link
        {...calendarLink(
          organizationId,
          source.entityId,
          formatDateOnly(new Date(source.startsAt)),
        )}
        className="truncate font-medium text-foreground underline-offset-4 hover:underline"
        title={title}
      >
        {title}
      </Link>
    </span>
  );
}
