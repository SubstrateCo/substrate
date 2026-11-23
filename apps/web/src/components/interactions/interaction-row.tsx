import type { InteractionKind } from "@substrate/contracts/context/interactions";

import { Fragment, type ReactNode } from "react";

import { interactionTypes } from "./interaction-types";
import { Timestamp } from "@/components/time/timestamp";
import { Item, ItemContent, ItemMedia } from "@/components/ui/item";

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
    <Item asChild size="xs" className="group/row items-start">
      <li>
        {icon && (
          <ItemMedia variant="icon">
            <Icon aria-hidden className={textClass} />
          </ItemMedia>
        )}
        <ItemContent className="min-w-0">
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
        </ItemContent>
      </li>
    </Item>
  );
}
