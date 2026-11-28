import { Fragment, type ReactElement } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { LucideIcon } from "lucide-react";

export type ContextAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export function ActionContextMenu({
  actions,
  children,
}: {
  actions: ContextAction[][];
  children: ReactElement;
}) {
  const groups = actions.filter((group) => group.length);
  if (!groups.length) return children;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {groups.map((group, index) => (
          <Fragment key={group[0]!.label}>
            {index > 0 && <ContextMenuSeparator />}
            {group.map(({ label, icon: Icon, onSelect, destructive, disabled }) => (
              <ContextMenuItem
                key={label}
                variant={destructive ? "destructive" : "default"}
                disabled={disabled}
                onSelect={onSelect}
              >
                <Icon aria-hidden="true" />
                {label}
              </ContextMenuItem>
            ))}
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
