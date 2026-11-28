import {
  notificationLevels,
  type NotificationLevel,
} from "@substrate/contracts/notifications/preferences";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format/date";
import { levelLabels, muteLabels, type MuteChoice, type MuteState } from "@/lib/notifications/mute";
import { Bell, BellOff, Crown, Ellipsis, Globe, LogOut, Trash2 } from "lucide-react";

const muteChoices = ["off", "1h", "8h", "24h", "forever"] as const satisfies readonly MuteChoice[];
const defaultLevel = "default";

/** The viewer's own alert settings for one conversation. */
export type ConversationNotificationMenu = {
  /** The level the conversation uses when it has none of its own. */
  defaultLevel: NotificationLevel;
  /** Null follows the default. Undefined while the settings load. */
  level: NotificationLevel | null | undefined;
  mute: MuteState | undefined;
  pending: boolean;
  onLevel: (level: NotificationLevel | null) => void;
  onMute: (choice: MuteChoice) => void;
};

export function ConversationActionsMenu({
  leaveLabel = "Leave conversation",
  deleteLabel,
  notifications,
  onLeave,
  onTransfer,
  onDelete,
  onSharing,
}: {
  /** "Leave channel" or "Leave group". */
  leaveLabel?: string;
  /** "Delete channel" or "Delete group": the item names what it destroys. */
  deleteLabel: string;
  /** Only for members, who get alerts from the conversation. */
  notifications?: ConversationNotificationMenu;
  onLeave?: () => void;
  onTransfer?: () => void;
  onDelete?: () => void;
  onSharing?: () => void;
}) {
  const hasActions = [notifications, onLeave, onTransfer, onDelete, onSharing].some(Boolean);
  if (!hasActions) return null;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Conversation actions">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Conversation actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {notifications && (
          <>
            <NotificationItems {...notifications} />
            {(onSharing || onLeave || onTransfer || onDelete) && <DropdownMenuSeparator />}
          </>
        )}
        {onSharing && (
          <DropdownMenuItem onSelect={onSharing}>
            <Globe />
            External collaboration
          </DropdownMenuItem>
        )}
        {onLeave && (
          <DropdownMenuItem onSelect={onLeave}>
            <LogOut />
            {leaveLabel}
          </DropdownMenuItem>
        )}
        {onTransfer && (
          <DropdownMenuItem onSelect={onTransfer}>
            <Crown />
            Change owner
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            {(onSharing || onLeave || onTransfer) && <DropdownMenuSeparator />}
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              {deleteLabel}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationItems({
  defaultLevel: fallback,
  level,
  mute,
  pending,
  onLevel,
  onMute,
}: ConversationNotificationMenu) {
  const loading = level === undefined || mute === undefined;
  const muted = mute !== undefined && mute.kind !== "off";
  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={loading}>
          <Bell />
          Notifications
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={level ?? defaultLevel}
            onValueChange={(value) => {
              if (value === defaultLevel) return onLevel(null);
              const next = notificationLevels.find((option) => option === value);
              if (next) onLevel(next);
            }}
          >
            <DropdownMenuRadioItem value={defaultLevel} disabled={pending}>
              Default ({levelLabels[fallback]})
            </DropdownMenuRadioItem>
            {notificationLevels.map((option) => (
              <DropdownMenuRadioItem key={option} value={option} disabled={pending}>
                {levelLabels[option]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={loading}>
          <BellOff />
          {muted ? "Muted" : "Mute"}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {mute?.kind === "until" && (
            <DropdownMenuLabel>Muted until {formatDateTime(mute.until)}</DropdownMenuLabel>
          )}
          <DropdownMenuRadioGroup
            value={mute?.kind === "until" ? "" : (mute?.kind ?? "")}
            onValueChange={(value) => {
              const choice = muteChoices.find((option) => option === value);
              if (choice) onMute(choice);
            }}
          >
            {muteChoices.map((choice) => (
              <DropdownMenuRadioItem key={choice} value={choice} disabled={pending}>
                {muteLabels[choice]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}
