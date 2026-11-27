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

/** One row of a `ConfigurationList`: the picture, name and detail, then its actions. */
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
    // The Item sits inside the list item, so the list's dividers stay on the <li>.
    <li>
      <Item className="group/row flex-nowrap">
        {picture && <ItemMedia variant="icon">{picture}</ItemMedia>}
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full wrap-anywhere">
            {mono ? <code>{name}</code> : name}
          </ItemTitle>
          <ItemDescription className="wrap-anywhere">{detail}</ItemDescription>
        </ItemContent>
        {actions && <ItemActions>{actions}</ItemActions>}
      </Item>
    </li>
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

/** A read-only row, such as a skill or server that Substrate adds on its own. */
export function CatalogRowStatic({
  name,
  detail,
  picture,
  mono = false,
}: {
  name: string;
  detail: ReactNode;
  picture?: ReactNode;
  mono?: boolean;
}) {
  return <CatalogRowLayout picture={picture} name={name} detail={detail} mono={mono} />;
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
  detail: ReactNode;
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
