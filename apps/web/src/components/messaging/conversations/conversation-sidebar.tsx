import type { LinkProps } from "@tanstack/react-router";

import type { KeyboardEvent } from "react";

import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { PageSidebarErrorState } from "@/components/layout/page-sidebar-error-state";
import type { DirectMessageAgent } from "@/components/messaging/conversations/conversation-create-menu";
import { ConversationSection } from "@/components/messaging/conversations/conversation-section";
import type { Conversation } from "@/lib/messaging/conversations";
import type { PickerPerson } from "@/lib/people/people-picker";
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
  people,
  agents,
  onSelect,
  conversationLink,
  onCreate,
  onMessagePerson,
  onMessageAgent,
  loading = false,
  error,
  onRetry,
}: {
  conversations: Conversation[];
  state: ResourceStatus;
  selectedId?: string;
  people?: PickerPerson[];
  agents?: DirectMessageAgent[];
  onSelect: (id: string) => void;
  conversationLink: (id: string) => LinkProps;
  onCreate: (kind: Conversation["kind"]) => void;
  onMessagePerson?: (person: PickerPerson) => void;
  onMessageAgent?: (agent: DirectMessageAgent) => void;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const errorState = error && (
    <PageSidebarErrorState
      title="Couldn’t load conversations"
      unavailable={state === "unavailable"}
      onRetry={state === "unavailable" ? undefined : onRetry}
    />
  );
  const showList = state !== "unavailable" && (!error || conversations.length > 0);
  return (
    <PageSidebar id="conversation-sidebar" aria-label="Conversations" aria-busy={loading}>
      <PageSidebarHeader title="Messages" />
      {showList ? (
        <PageSidebarContent className="pt-0" onKeyDown={moveBetweenConversations}>
          {errorState}
          {(["channel", "partner", "dm"] as const).map((section) => (
            <ConversationSection
              key={section}
              section={section}
              conversations={conversations}
              selectedId={selectedId}
              loading={loading}
              people={people}
              agents={agents}
              onSelect={onSelect}
              conversationLink={conversationLink}
              onCreate={onCreate}
              onMessagePerson={onMessagePerson}
              onMessageAgent={onMessageAgent}
            />
          ))}
        </PageSidebarContent>
      ) : (
        errorState
      )}
    </PageSidebar>
  );
}
