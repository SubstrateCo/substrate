import { Link, type LinkProps } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { Button } from "../../ui/button";
import { buttonVariants } from "../../ui/button-variants";
import { ConversationKindIcon } from "./conversation-kind-icon";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { conversationName, type Conversation } from "@/lib/messaging/conversations";
import { cn } from "cn";
import { Globe } from "lucide-react";

function SidebarItemContent({
  icon,
  title,
  unread = false,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  unread?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      {icon}
      {/* oxlint-disable-next-line design/no-decorative-class -- An unread conversation. */}
      <span className={unread ? "min-w-0 truncate font-semibold" : "min-w-0 truncate"}>
        {title}
      </span>
      {children}
    </>
  );
}

export function ConversationSidebarLoadingRow() {
  return (
    <div
      aria-hidden="true"
      className={cn(buttonVariants({ variant: "sidebar" }), "w-full justify-start")}
    >
      <SidebarItemContent
        icon={<Skeleton className="size-4 shrink-0" />}
        title={<SkeletonText width="7rem" />}
      />
    </div>
  );
}

export function ConversationSidebarItem({
  conversation,
  selected,
  onSelect,
  link,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: () => void;
  link: LinkProps;
}) {
  return (
    <Button asChild variant="sidebar" className="w-full justify-start">
      <Link
        {...link}
        data-conversation-item=""
        aria-current={selected ? "page" : undefined}
        onClick={onSelect}
      >
        <SidebarItemContent
          icon={<ConversationSidebarIcon conversation={conversation} />}
          title={conversationName(conversation)}
          unread={!!conversation.unreadCount}
        >
          {/* Channels already sit under "Partner channels"; DMs and groups need the cue here. */}
          {conversation.partner && conversation.kind !== "channel" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="img"
                  aria-label="Includes people from another organization"
                  tabIndex={0}
                  className="shrink-0 text-muted-foreground"
                >
                  <Globe aria-hidden="true" className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Includes people from another organization</TooltipContent>
            </Tooltip>
          )}
          <ConversationUnreadBadge conversation={conversation} />
        </SidebarItemContent>
      </Link>
    </Button>
  );
}

function ConversationSidebarIcon({ conversation }: { conversation: Conversation }) {
  if (conversation.kind === "channel" && conversation.private)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span role="img" aria-label="Private channel" tabIndex={0} className="shrink-0">
            <ConversationKindIcon kind="channel" private className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent>Private channel</TooltipContent>
      </Tooltip>
    );
  return (
    <ConversationKindIcon
      kind={conversation.kind}
      private={conversation.private}
      className="size-4 shrink-0"
    />
  );
}

/** A mention badge replaces the unread count; the row stays bold either way. */
function ConversationUnreadBadge({ conversation }: { conversation: Conversation }) {
  const { mentionCount, unreadCount } = conversation;
  if (mentionCount)
    return (
      <span
        className="ml-auto min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center text-xs leading-5 font-medium text-primary-foreground tabular-nums"
        aria-label={`${mentionCount} ${mentionCount === 1 ? "mention" : "mentions"}, ${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"}`}
      >
        {mentionCount > 99 ? "99+" : mentionCount}
      </span>
    );
  if (!unreadCount) return null;
  return (
    <span
      className="ml-auto shrink-0 text-xs font-medium tabular-nums"
      aria-label={`${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"}`}
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}
