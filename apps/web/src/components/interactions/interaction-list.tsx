import { Link } from "@tanstack/react-router";

import { interactionTypes, type InteractionRow } from "./interaction-types";
import { Tag } from "@/components/feedback/tag";
import { Timestamp } from "@/components/time/timestamp";
import { cn } from "cn";

export function InteractionList({
  rows,
  organizationId,
}: {
  rows: InteractionRow[];
  organizationId: string;
}) {
  return (
    <ol className="divide-y">
      {rows.map((row) => {
        const { icon: Icon, label, textClass } = interactionTypes[row.kind];
        const minutes = row.endedAt
          ? Math.round((Date.parse(row.endedAt) - Date.parse(row.occurredAt)) / 60000)
          : null;
        return (
          <li key={row.entityId} className="flex items-start gap-2 px-4 py-2">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md bg-muted",
                textClass,
              )}
            >
              <Icon aria-hidden className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <Link
                  from="/interactions/"
                  to="/interactions"
                  search={(previous) => ({
                    ...previous,
                    workspaceId: organizationId,
                    section: "person",
                    profileId: row.contactEntityId,
                    recordId: undefined,
                  })}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  {row.contactName}
                </Link>
                <span className="text-xs text-muted-foreground">
                  <Timestamp value={row.occurredAt} format="datetime" />
                </span>
              </div>
              <Link
                from="/interactions/"
                to="/interactions"
                search={(previous) => ({
                  ...previous,
                  workspaceId: organizationId,
                  recordId: row.entityId,
                })}
                className="block text-sm/5 wrap-break-word whitespace-pre-wrap underline-offset-4 hover:underline"
                aria-label={`Open interaction: ${row.summary}`}
              >
                {row.summary}
              </Link>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{label}</span>
                <span aria-hidden>·</span>
                <span>Logged by {row.actor.displayName}</span>
                {minutes !== null && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{minutes} min recorded</span>
                  </>
                )}
                <Tag>{row.origin === "manual" ? "Manual" : "Published from message"}</Tag>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
