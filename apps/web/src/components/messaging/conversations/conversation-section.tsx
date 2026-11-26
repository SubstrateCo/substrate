import type { LinkProps } from "@tanstack/react-router";

import { useState, type ReactNode } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import {
  ConversationSidebarItem,
  ConversationSidebarLoadingRow,
} from "@/components/messaging/conversations/conversation-sidebar-item";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Heading } from "@/components/ui/heading";
import type { Conversation } from "@/lib/messaging/conversations";
import { ChevronRight } from "lucide-react";

const sectionLabels = { channel: "Channels", partner: "Partner channels", dm: "Direct messages" };
const emptyLabels = { channel: "No channels yet", dm: "No conversations yet" };

/** The actions in a section header. Partner channels are created from Channels, so they have none. */
export type ConversationSectionActions = (section: "channel" | "dm") => ReactNode;

export function ConversationSection({
  section,
  conversations,
  selectedId,
  loading,
  onSelect,
  conversationLink,
  renderSectionActions,
}: {
  section: keyof typeof sectionLabels;
  conversations: Conversation[];
  selectedId?: string;
  loading: boolean;
  onSelect: (id: string) => void;
  conversationLink: (id: string) => LinkProps;
  renderSectionActions: ConversationSectionActions;
}) {
  // Partner channels include people from another organization, wherever they are hosted.
  const items = conversations.filter((conversation) =>
    section === "dm"
      ? conversation.kind !== "channel"
      : conversation.kind === "channel" && !!conversation.partner === (section === "partner"),
  );
  const [collapsed, setCollapsed] = useState(false);
  // A collapsed section keeps the open conversation under its header, so the place never vanishes.
  const pinned = collapsed
    ? items.find((conversation) => conversation.id === selectedId)
    : undefined;
  const listed = pinned ? items.filter((conversation) => conversation !== pinned) : items;
  // Partner channels are created from Channels, so an empty partner section has nothing to show.
  if (section === "partner" && !items.length) return null;
  return (
    <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)} asChild>
      <section aria-label={sectionLabels[section]}>
        <ConversationSectionHeader
          section={section}
          collapsed={collapsed}
          count={items.length}
          renderSectionActions={renderSectionActions}
        />
        {pinned && (
          <div className="mt-0.5">
            <ConversationSidebarItem
              conversation={pinned}
              selected
              onSelect={() => onSelect(pinned.id)}
              link={conversationLink(pinned.id)}
            />
          </div>
        )}
        {/* The padding keeps focus rings of the first and last rows from being clipped. */}
        <CollapsibleContent className="-mx-1 -my-0.5">
          <div className="px-1 py-0.5">
            <div className="mt-0.5 flex flex-col gap-0.5">
              {loading && conversations.length === 0 && (
                <div
                  role="status"
                  aria-label={section === "dm" ? "Loading direct messages" : "Loading channels"}
                >
                  <ConversationSidebarLoadingRow />
                  <ConversationSidebarLoadingRow />
                </div>
              )}
              {listed.map((conversation) => (
                <ConversationSidebarItem
                  key={conversation.id}
                  conversation={conversation}
                  selected={selectedId === conversation.id}
                  onSelect={() => onSelect(conversation.id)}
                  link={conversationLink(conversation.id)}
                />
              ))}
            </div>
            {/* The section header's create button offers the action. */}
            {!loading && items.length === 0 && section !== "partner" && (
              <div className="px-2 py-1">
                <ContentNotice variant="inline" title={emptyLabels[section]} />
              </div>
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function ConversationSectionHeader({
  section,
  collapsed,
  count,
  renderSectionActions,
}: {
  section: keyof typeof sectionLabels;
  collapsed: boolean;
  count: number;
  renderSectionActions: ConversationSectionActions;
}) {
  return (
    <div className="flex h-7 items-center justify-between gap-1 pr-1 pl-2">
      <Heading level={2} variant="inherit" className="min-w-0">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="disclosure" size="xs" className="-ml-2">
            {sectionLabels[section]}
            {collapsed && count > 0 && (
              <span className="font-normal tabular-nums">
                {count}
                <span className="sr-only"> conversations</span>
              </span>
            )}
            <ChevronRight
              aria-hidden="true"
              className={
                collapsed
                  ? "transition-transform duration-150 ease-out"
                  : "rotate-90 transition-transform duration-150 ease-out"
              }
            />
          </Button>
        </CollapsibleTrigger>
      </Heading>
      {section !== "partner" && renderSectionActions(section)}
    </div>
  );
}
