import { Hash, LockKeyhole, MessageCircle, Plus, Users } from "lucide-react";
import { conversationName, type Conversation } from "@/lib/messaging";
import { Button } from "@/components/ui/button";

export function ConversationSidebar({
  workspaceName,
  conversations,
  selectedId,
  onSelect,
  onCreate,
  mobileOpen,
}: {
  workspaceName: string;
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onCreate: (kind: Conversation["kind"]) => void;
  mobileOpen: boolean;
}) {
  return (
    <aside
      id="conversation-sidebar"
      aria-label="Conversations"
      className={`${mobileOpen ? "flex" : "hidden"} min-w-0 w-full shrink-0 flex-col border-r bg-[#f7f7f8] md:flex md:w-60 lg:w-64`}
    >
      <div className="flex h-16 shrink-0 items-center border-b px-3">
        <p className="truncate font-semibold" title={workspaceName}>
          {workspaceName}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-2 py-5">
        <div className="px-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight">Messages</p>
        </div>
        {(["channel", "dm"] as const).map((section) => (
          <section key={section}>
            <div className="mb-1 flex items-center justify-between px-2">
              <h2 className="text-xs font-semibold text-muted-foreground">
                {section === "channel" ? "Channels" : "Direct messages"}
              </h2>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={section === "channel" ? "Create channel" : "New direct message"}
                onClick={() => onCreate(section)}
              >
                <Plus />
              </Button>
            </div>
            {conversations
              .filter((conversation) =>
                section === "channel"
                  ? conversation.kind === "channel"
                  : conversation.kind !== "channel",
              )
              .map((conversation) => {
                const Icon =
                  conversation.kind === "channel"
                    ? conversation.private
                      ? LockKeyhole
                      : Hash
                    : conversation.kind === "group"
                      ? Users
                      : MessageCircle;
                return (
                  <Button
                    key={conversation.id}
                    variant="ghost"
                    className={`mb-0.5 w-full justify-start gap-2 px-2 font-normal ${selectedId === conversation.id ? "bg-indigo-100 text-indigo-900 hover:bg-indigo-100" : "text-zinc-600"}`}
                    aria-current={selectedId === conversation.id ? "page" : undefined}
                    onClick={() => onSelect(conversation.id)}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{conversationName(conversation)}</span>
                  </Button>
                );
              })}
            {!conversations.some((conversation) =>
              section === "channel"
                ? conversation.kind === "channel"
                : conversation.kind !== "channel",
            ) && (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                {section === "channel" ? "No channels yet" : "No conversations yet"}
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-start text-xs text-muted-foreground"
              onClick={() => onCreate(section === "channel" ? "channel" : "group")}
            >
              <Plus />
              {section === "channel" ? "Add a channel" : "New group message"}
            </Button>
          </section>
        ))}
      </div>
      <div className="border-t p-4 text-[11px] text-muted-foreground">
        A little less switching. A lot more doing.
      </div>
    </aside>
  );
}
