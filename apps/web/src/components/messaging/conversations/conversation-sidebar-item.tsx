import { Link, type LinkProps } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { ConversationKindIcon } from "./conversation-kind-icon";
import { AgentAvatarView } from "@/components/agents/agent-avatar";
import { badgeCount } from "@/components/feedback/badge-count";
import { CountBadge } from "@/components/feedback/count-badge";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
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
  const agent =
    conversation.kind === "agent_dm"
      ? conversation.members.find((member) => member.type === "agent")
      : undefined;
  if (agent)
    return <AgentAvatarView avatar={agent.avatar} size="xs" ambient="off" className="-mx-0.5" />;
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

function ConversationUnreadBadge({ conversation }: { conversation: Conversation }) {
  const { mentionCount, unreadCount } = conversation;
  const unread = `${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"}`;
  if (mentionCount)
    return (
      <CountBadge
        className="ml-auto"
        aria-label={`${mentionCount} ${mentionCount === 1 ? "mention" : "mentions"}, ${unread}`}
      >
        @{badgeCount(mentionCount)}
      </CountBadge>
    );
  if (!unreadCount) return null;
  return (
    <CountBadge className="ml-auto" aria-label={unread}>
      {badgeCount(unreadCount)}
    </CountBadge>
  );
}
