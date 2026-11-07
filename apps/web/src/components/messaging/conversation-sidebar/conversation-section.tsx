import { LoadingState } from "@/components/feedback/loading-state";
import { ConversationSidebarItem } from "@/components/messaging/conversation-sidebar-item";
import { ConversationCreateMenu } from "@/components/messaging/conversation-sidebar/conversation-create-menu";
import type { Conversation } from "@/components/messaging/types";

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
  onSelect,
  onCreate,
}: {
  section: keyof typeof sectionLabels;
  conversations: Conversation[];
  selectedId?: string;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: (kind: Conversation["kind"]) => void;
}) {
  const items = conversations.filter((conversation) =>
    section === "dm"
      ? conversation.kind !== "channel"
      : conversation.kind === "channel" && !!conversation.partner === (section === "partner"),
  );
  return (
    <section aria-label={sectionLabels[section]}>
      <div className="mb-1 flex items-center justify-between px-2">
        <h2 className="text-xs font-semibold text-muted-foreground">{sectionLabels[section]}</h2>
        {section !== "partner" && <ConversationCreateMenu section={section} onCreate={onCreate} />}
      </div>
      {loading && conversations.length === 0 && (
        <LoadingState
          label={section === "dm" ? "Loading direct messages…" : "Loading channels…"}
          variant="compact"
        />
      )}
      {items.map((conversation) => (
        <ConversationSidebarItem
          key={conversation.id}
          conversation={conversation}
          selected={selectedId === conversation.id}
          onSelect={() => onSelect(conversation.id)}
        />
      ))}
      {!loading && items.length === 0 && (
        <p className="px-2 py-2 text-xs text-muted-foreground">{emptyLabels[section]}</p>
      )}
    </section>
  );
}
