import type { ReactNode } from "react";

import { SkeletonText } from "@/components/feedback/skeleton-text";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Settings, Trash2 } from "lucide-react";

function CatalogRowLayout({
  picture,
  name,
  detail,
  actions,
  mono,
}: {
  picture?: ReactNode;
  name: ReactNode;
  detail: ReactNode;
  actions?: ReactNode;
  mono?: boolean;
}) {
  return (
    <Item asChild size="xs" className="group/row">
      <li>
        {picture && <ItemMedia>{picture}</ItemMedia>}
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full wrap-anywhere">
            {mono ? <code>{name}</code> : name}
          </ItemTitle>
          <ItemDescription className="wrap-anywhere">{detail}</ItemDescription>
        </ItemContent>
        {actions && <ItemActions>{actions}</ItemActions>}
      </li>
    </Item>
  );
}

export function CatalogRowLoading({ picture = false }: { picture?: boolean }) {
  return (
    <CatalogRowLayout
      picture={picture && <Skeleton className="size-4 shrink-0" />}
      name={<SkeletonText width="9rem" />}
      detail={<SkeletonText width="15rem" />}
    />
  );
}

export function CatalogRow({
  name,
  detail,
  picture,
  mono = false,
  onSettings,
  onEdit,
  onDelete,
  disabled,
}: {
  name: string;
  /** Show the name as a file name, in monospace. */
  mono?: boolean;
  detail: string;
  picture?: ReactNode;
  onSettings?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <CatalogRowLayout
      picture={picture}
      name={name}
      detail={detail}
      mono={mono}
      actions={
        <RowActions label={`Actions for ${name}`}>
          {onSettings && (
            <RowAction label={`Run settings for ${name}`} disabled={disabled} onClick={onSettings}>
              <Settings />
            </RowAction>
          )}
          <RowAction label={`Edit ${name}`} disabled={disabled} onClick={onEdit}>
            <Pencil />
          </RowAction>
          <RowAction label={`Delete ${name}`} destructive disabled={disabled} onClick={onDelete}>
            <Trash2 />
          </RowAction>
        </RowActions>
      }
    />
  );
}
