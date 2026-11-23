import type { ReactNode } from "react";

import { RowAction, RowActions } from "@/components/layout/row-actions";
import { PersonAvatar } from "@/components/people/person-avatar";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { UserMinus } from "lucide-react";

/**
 * One person or agent with access to a record or project: avatar, name, an optional meta line,
 * the level (text, or a ghost select for a viewer who may change it), and a remove action when the viewer may remove them.
 */
export function AccessRow({
  name,
  image,
  agent = false,
  meta,
  level,
  levelControl,
  disabled = false,
  onRemove,
}: {
  name: string;
  image?: string | null;
  agent?: boolean;
  meta?: ReactNode;
  /** The level as text, such as "Can edit". */
  level: string;
  /** Replaces the text when the viewer may change the level: a ghost `SelectTrigger`. */
  levelControl?: ReactNode;
  disabled?: boolean;
  onRemove?: () => void;
}) {
  return (
    <Item asChild size="xs" className="group/row">
      <li>
        <ItemMedia>
          <PersonAvatar name={name} image={image} agent={agent} />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full">{name}</ItemTitle>
          {meta && <ItemDescription>{meta}</ItemDescription>}
        </ItemContent>
        <ItemActions>
          {levelControl ?? <span className="shrink-0 text-sm text-muted-foreground">{level}</span>}
          {onRemove && (
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
          )}
        </ItemActions>
      </li>
    </Item>
  );
}
