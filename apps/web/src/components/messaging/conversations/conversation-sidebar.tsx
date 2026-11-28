import type { LinkProps } from "@tanstack/react-router";

import type { KeyboardEvent } from "react";

import { sidebarId } from "./conversation-sidebar-focus";
import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import {
  ConversationSection,
  type ConversationSectionActions,
} from "@/components/messaging/conversations/conversation-section";
import type { Conversation } from "@/lib/messaging/conversations";
import type { ResourceStatus } from "@/lib/resource-state";

function moveBetweenConversations(event: KeyboardEvent<HTMLDivElement>) {
  const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  const current = event.target;
  if (!move || !(current instanceof HTMLElement) || !current.matches("[data-conversation-item]")) {
    return;
  }
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-conversation-item]")];
  const index = items.indexOf(current) + move;
  if (index < 0 || index >= items.length) return;
  event.preventDefault();
  items[index].focus();
}

export function ConversationSidebar({
  conversations,
  state,
  selectedId,
  onSelect,
  conversationLink,
  renderSectionActions,
  loading = false,
}: {
  conversations: Conversation[];
  state: ResourceStatus;
  selectedId?: string;
  onSelect: (id: string) => void;
  conversationLink: (id: string) => LinkProps;
  renderSectionActions: ConversationSectionActions;
  loading?: boolean;
}) {
  const showList = state !== "unavailable" && state !== "error";
  return (
    <PageSidebar id={sidebarId} aria-label="Conversations" aria-busy={loading}>
      <PageSidebarHeader title="Messages" />
      {showList && (
        <PageSidebarContent onKeyDown={moveBetweenConversations}>
          {(["channel", "partner", "dm"] as const).map((section) => (
            <ConversationSection
              key={section}
              section={section}
              conversations={conversations}
              selectedId={selectedId}
              loading={loading}
              onSelect={onSelect}
              conversationLink={conversationLink}
              renderSectionActions={renderSectionActions}
            />
          ))}
        </PageSidebarContent>
      )}
    </PageSidebar>
  );
}
