import { useId, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import {
  ConversationCreateMenu,
  type DirectMessageAgent,
} from "@/components/messaging/conversations/conversation-create-menu";
import { ConversationSidebarItem } from "@/components/messaging/conversations/conversation-sidebar-item";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@/lib/messaging/conversations";
import type { PickerPerson } from "@/lib/people/people-picker";
import { ChevronRight } from "lucide-react";

const sectionLabels = { channel: "Channels", partner: "Partner channels", dm: "Direct messages" };
const emptyLabels = { channel: "No channels yet", dm: "No conversations yet" };

export function ConversationSection({
  section,
  conversations,
  selectedId,
  loading,
  people,
  agents,
  onSelect,
  onCreate,
  onMessagePerson,
  onMessageAgent,
}: {
  section: keyof typeof sectionLabels;
  conversations: Conversation[];
  selectedId?: string;
  loading: boolean;
  people?: PickerPerson[];
  agents?: DirectMessageAgent[];
  onSelect: (id: string) => void;
  onCreate: (kind: Conversation["kind"]) => void;
  onMessagePerson?: (person: PickerPerson) => void;
  onMessageAgent?: (agent: DirectMessageAgent) => void;
}) {
  // Partner channels include people from another organization, wherever they are hosted.
  const items = conversations.filter((conversation) =>
    section === "dm"
      ? conversation.kind !== "channel"
      : conversation.kind === "channel" && !!conversation.partner === (section === "partner"),
  );
  const [collapsed, setCollapsed] = useState(false);
  const listId = useId();
  // Partner channels are created from Channels, so an empty partner section has nothing to show.
  if (section === "partner" && !items.length) return null;
  return (
    <section aria-label={sectionLabels[section]}>
      <div className="flex h-7 items-center justify-between gap-1 pr-1 pl-2">
        <h2 className="min-w-0">
          <Button
            type="button"
            variant="disclosure"
            size="xs"
            className="-ml-2"
            aria-expanded={!collapsed}
            aria-controls={listId}
            onClick={() => setCollapsed(!collapsed)}
          >
            {sectionLabels[section]}
            <ChevronRight
              aria-hidden="true"
              className={
                collapsed
                  ? "transition-transform duration-150 ease-out"
                  : "rotate-90 transition-transform duration-150 ease-out"
              }
            />
            {collapsed && items.length > 0 && (
              <span className="text-muted-foreground tabular-nums">
                {items.length}
                <span className="sr-only"> conversations</span>
              </span>
            )}
          </Button>
        </h2>
        {section !== "partner" && (
          <ConversationCreateMenu
            section={section}
            people={people}
            agents={agents}
            onCreate={onCreate}
            onMessagePerson={onMessagePerson}
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
      <div id={listId} className="mt-0.5 flex flex-col gap-0.5">
        {!collapsed &&
          items.map((conversation) => (
            <ConversationSidebarItem
              key={conversation.id}
              conversation={conversation}
              selected={selectedId === conversation.id}
              onSelect={() => onSelect(conversation.id)}
            />
          ))}
      </div>
      {!loading && !collapsed && items.length === 0 && section !== "partner" && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{emptyLabels[section]}</p>
      )}
    </section>
  );
}
