import { useId, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { ConversationSidebarItem } from "@/components/messaging/conversations/conversation-sidebar-item";
import {
  ConversationCreateMenu,
  type DirectMessageAgent,
  type DirectMessagePerson,
} from "@/components/messaging/conversations/conversation-sidebar/conversation-create-menu";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@/lib/messaging/conversations";
import { ChevronDown } from "lucide-react";

const sectionLabels = { channel: "Channels", partner: "Partner channels", dm: "Direct messages" };
const emptyLabels = {
  channel: "No channels yet",
  partner: "No partner channels yet",
  dm: "No conversations yet",
};

export function ConversationSection({
  section,
  conversations,
  selectedId,
  loading,
  people,
  agents,
  onSelect,
  onCreate,
  onMessageAgent,
}: {
  section: keyof typeof sectionLabels;
  conversations: Conversation[];
  selectedId?: string;
  loading: boolean;
  people?: DirectMessagePerson[];
  agents?: DirectMessageAgent[];
  onSelect: (id: string) => void;
  onCreate: (kind: Conversation["kind"], recipient?: string) => void;
  onMessageAgent?: (agent: DirectMessageAgent) => void;
}) {
  const items = conversations.filter((conversation) =>
    section === "dm"
      ? conversation.kind !== "channel"
      : conversation.kind === "channel" && !!conversation.partner === (section === "partner"),
  );
  const [collapsed, setCollapsed] = useState(false);
  const listId = useId();
  const collapsible = items.length > 1;
  const isCollapsed = collapsible && collapsed;
  // A collapsed section keeps the open conversation visible.
  const shown = isCollapsed ? items.filter((item) => item.id === selectedId) : items;
  return (
    <section aria-label={sectionLabels[section]}>
      <div className="mb-1 flex items-center justify-between px-2">
        <h2 className="min-w-0 text-xs font-semibold text-muted-foreground">
          {collapsible ? (
            <Button
              type="button"
              variant="disclosure"
              size="xs"
              className="-ml-2"
              aria-expanded={!isCollapsed}
              aria-controls={listId}
              onClick={() => setCollapsed(!collapsed)}
            >
              <span className="font-semibold">{sectionLabels[section]}</span>
              {isCollapsed && (
                <span className="rounded-full bg-sidebar-accent px-1.5 py-px leading-4 font-medium text-sidebar-accent-foreground tabular-nums">
                  {items.length}
                  <span className="sr-only"> conversations</span>
                </span>
              )}
              <ChevronDown
                aria-hidden="true"
                className={isCollapsed ? "-rotate-90 transition-transform" : "transition-transform"}
              />
            </Button>
          ) : (
            sectionLabels[section]
          )}
        </h2>
        {section !== "partner" && (
          <ConversationCreateMenu
            section={section}
            people={people}
            agents={agents}
            onCreate={onCreate}
            onMessageAgent={onMessageAgent}
          />
        )}
      </div>
      {loading && conversations.length === 0 && (
        <LoadingState
          label={section === "dm" ? "Loading direct messages…" : "Loading channels…"}
          variant="compact"
        />
      )}
      <div id={listId}>
        {shown.map((conversation) => (
          <ConversationSidebarItem
            key={conversation.id}
            conversation={conversation}
            selected={selectedId === conversation.id}
            onSelect={() => onSelect(conversation.id)}
          />
        ))}
      </div>
      {!loading && items.length === 0 && (
        <p className="px-2 py-2 text-xs text-muted-foreground">{emptyLabels[section]}</p>
      )}
    </section>
  );
}
