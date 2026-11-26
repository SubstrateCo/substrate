import type { LinkProps } from "@tanstack/react-router";

import type { KeyboardEvent } from "react";

import { ErrorState } from "@/components/feedback/error-state";
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

/** ArrowUp and ArrowDown move focus between conversations, across sections. */
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
  error,
  onRetry,
}: {
  conversations: Conversation[];
  state: ResourceStatus;
  selectedId?: string;
  onSelect: (id: string) => void;
  conversationLink: (id: string) => LinkProps;
  renderSectionActions: ConversationSectionActions;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  // With no conversations to show, the main pane shows the load error.
  const showList = state !== "unavailable" && (!error || conversations.length > 0);
  return (
    <PageSidebar id="conversation-sidebar" aria-label="Conversations" aria-busy={loading}>
      <PageSidebarHeader title="Messages" />
      {showList && (
        <PageSidebarContent onKeyDown={moveBetweenConversations}>
          {error && (
            <div className="px-2">
              <ErrorState inline title="Couldn’t load conversations" onRetry={onRetry} />
            </div>
          )}
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
