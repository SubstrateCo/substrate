import type { ReactNode } from "react";

import { RowAction, RowActions } from "@/components/layout/row-actions";
import { ActorAvatar } from "@/components/people/actor-avatar";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import type { ActorIdentity } from "@/lib/actors/identity";
import { UserMinus } from "lucide-react";

export function AccessRow({
  actor,
  meta,
  level,
  levelControl,
  disabled = false,
  onRemove,
}: {
  actor: ActorIdentity;
  meta?: ReactNode;
  level: string;
  levelControl?: ReactNode;
  disabled?: boolean;
  onRemove?: () => void;
}) {
  const { name } = actor;
  return (
    <Item asChild size="xs" className="group/row min-w-0 flex-nowrap">
      <li>
        <ItemMedia>
          <ActorAvatar actor={actor} />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full">
            <span className="truncate">{name}</span>
          </ItemTitle>
          {meta && <ItemDescription className="wrap-anywhere">{meta}</ItemDescription>}
        </ItemContent>
        <ItemActions>
          <div className="w-30 shrink-0">
            {levelControl ?? (
              <span className="block px-2.5 text-sm text-muted-foreground">{level}</span>
            )}
          </div>
          {onRemove ? (
            <RowActions label={`Actions for ${name}`}>
              <RowAction
                label={`Remove ${name}’s access`}
                destructive
                disabled={disabled}
                onClick={onRemove}
              >
                <UserMinus aria-hidden="true" />
              </RowAction>
            </RowActions>
          ) : (
            <span aria-hidden="true" className="w-7 shrink-0" />
          )}
        </ItemActions>
      </li>
    </Item>
  );
}
