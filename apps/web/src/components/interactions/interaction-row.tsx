import type { InteractionKind } from "@substrate/contracts/context/interactions";

import { Fragment, type ReactNode } from "react";

import { interactionTypes } from "./interaction-types";
import { Timestamp } from "@/components/time/timestamp";
import { Item, ItemContent, ItemMedia } from "@/components/ui/item";

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
  summary: ReactNode;
  contact?: ReactNode;
  icon?: boolean;
  details?: ReactNode[];
  actions?: ReactNode;
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
            {contact && (
              <span className="min-w-0 text-sm font-medium wrap-anywhere text-foreground">
                {contact}
              </span>
            )}
            {!icon && <span>{label}</span>}
            <Timestamp value={occurredAt} format="datetime" />
            {actions && <span className="ml-auto">{actions}</span>}
          </div>
          <div className="text-sm wrap-anywhere whitespace-pre-wrap">{summary}</div>
          {details.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {details.map((detail, index) => (
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
