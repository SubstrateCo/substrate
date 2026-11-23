import type { InteractionKind } from "@substrate/contracts/context/interactions";

import { Fragment, type ReactNode } from "react";

import { interactionTypes } from "./interaction-types";
import { actionRow } from "@/components/layout/row-actions";
import { Timestamp } from "@/components/time/timestamp";
import { cn } from "cn";

/**
 * One interaction in a list or record section: a top line (contact, kind, time, row actions),
 * the summary, optional details, and the meeting it came from. Inside `recordRows`.
 */
export function InteractionRow({
  kind,
  occurredAt,
  summary,
  contact,
  icon = false,
  details = [],
  actions,
  source,
}: {
  kind: InteractionKind;
  occurredAt: string;
  /** The summary text, or a link that opens the interaction. */
  summary: ReactNode;
  /** A link to the contact, first on the top line. */
  contact?: ReactNode;
  /** Shows the kind as a colored icon tile, as in the timeline. */
  icon?: boolean;
  /** Muted details after the summary, separated by dots. */
  details?: ReactNode[];
  /** `RowAction`s in `RowActions`, at the end of the top line. */
  actions?: ReactNode;
  /** A `MeetingSourceLink`. */
  source?: ReactNode;
}) {
  const { icon: Icon, label, textClass } = interactionTypes[kind];
  return (
    <li
      className={cn(
        actionRow,
        "flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 hover:bg-row-hover",
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md bg-muted",
            textClass,
          )}
        >
          <Icon aria-hidden className="size-3.5" />
        </span>
      )}
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {contact && <span className="text-sm font-medium text-foreground">{contact}</span>}
          {!icon && <span>{label}</span>}
          <Timestamp value={occurredAt} format="datetime" />
          {actions && <span className="ml-auto">{actions}</span>}
        </div>
        <div className="text-sm wrap-break-word whitespace-pre-wrap">{summary}</div>
        {details.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {details.map((detail, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- The details are a fixed, ordered list.
              <Fragment key={index}>
                {index > 0 && <span aria-hidden>·</span>}
                {detail}
              </Fragment>
            ))}
          </div>
        )}
        {source}
      </div>
    </li>
  );
}
