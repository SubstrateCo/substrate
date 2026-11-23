import type { ReactNode } from "react";

import { actionRow, RowAction, RowActions } from "@/components/layout/row-actions";
import { PersonAvatar } from "@/components/people/person-avatar";
import { cn } from "cn";
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
  className,
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
  className?: string;
}) {
  return (
    <li className={cn(actionRow, "flex items-center gap-3 px-3 py-2", className)}>
      <PersonAvatar name={name} image={image} agent={agent} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
      </div>
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
    </li>
  );
}
