import type { ShortcutId } from "@substrate/contracts/desktop/shortcuts";

import { Link, type LinkProps } from "@tanstack/react-router";

import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import { ariaKeyShortcuts, useShortcut } from "@/components/shortcuts/use-shortcut";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

export function WorkspaceAppButton({
  label,
  icon: Icon,
  to,
  shortcut,
  unread = false,
  unreadLabel = "unread notifications",
  dotTone = "primary",
}: {
  label: string;
  icon: LucideIcon;
  to: NonNullable<LinkProps["to"]>;
  /** The app shortcut that opens this app. */
  shortcut: ShortcutId;
  unread?: boolean;
  /** What the dot means, read after the label. */
  unreadLabel?: string;
  /** Primary for unread notifications; warning for work that needs the person. Red is for errors. */
  dotTone?: "primary" | "warning";
}) {
  const hotkey = useShortcut(shortcut);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="rail" size="icon-lg" className="relative" asChild>
          <Link
            to={to}
            // The workspace search param belongs to deep links, not to which app is open.
            activeOptions={{ includeSearch: false }}
            activeProps={{ "aria-current": "page" }}
            aria-label={unread ? `${label}, ${unreadLabel}` : label}
            aria-keyshortcuts={hotkey ? ariaKeyShortcuts(hotkey) : undefined}
          >
            <Icon className="size-5" />
            {unread && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-2 right-2 size-2 rounded-full ring-2 ring-rail",
                  dotTone === "warning" ? "bg-warning" : "bg-primary",
                )}
              />
            )}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {hotkey && <ShortcutKeys hotkey={hotkey} />}
      </TooltipContent>
    </Tooltip>
  );
}
