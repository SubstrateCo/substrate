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
          icon={
            conversation.kind === "channel" && conversation.private ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span role="img" aria-label="Private channel" tabIndex={0} className="shrink-0">
                    <ConversationKindIcon kind="channel" private className="size-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Private channel</TooltipContent>
              </Tooltip>
            ) : (
              <ConversationKindIcon
                kind={conversation.kind}
                private={conversation.private}
                className="size-4 shrink-0"
              />
            )
          }
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
          {/* A mention badge replaces the unread count; the row stays bold either way. */}
          {conversation.mentionCount ? (
            <span
              className="ml-auto min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center text-xs leading-5 font-medium text-primary-foreground"
              aria-label={`${conversation.mentionCount} ${conversation.mentionCount === 1 ? "mention" : "mentions"}, ${conversation.unreadCount} unread ${conversation.unreadCount === 1 ? "message" : "messages"}`}
            >
              {conversation.mentionCount > 99 ? "99+" : conversation.mentionCount}
            </span>
          ) : (
            !!conversation.unreadCount && (
              <span
                className="ml-auto shrink-0 text-xs font-medium"
                aria-label={`${conversation.unreadCount} unread ${conversation.unreadCount === 1 ? "message" : "messages"}`}
              >
                {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
              </span>
            )
          )}
        </SidebarItemContent>
      </Link>
    </Button>
  );
}
