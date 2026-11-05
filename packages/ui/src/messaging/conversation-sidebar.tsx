import { Hash, LockKeyhole, MessageCircle, Plus, Users } from "lucide-react";
import { conversationName, type Conversation } from "./types";
import { Button } from "../primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../primitives/dropdown-menu";

export function ConversationSidebar({
  conversations,
  selectedId,
  onSelect,
  onCreate,
  mobileOpen,
  loading = false,
}: {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onCreate: (kind: Conversation["kind"]) => void;
  mobileOpen: boolean;
  loading?: boolean;
}) {
  return (
    <aside
      id="conversation-sidebar"
      aria-label="Conversations"
      aria-busy={loading}
      className={`${mobileOpen ? "flex" : "hidden"} min-w-0 w-full shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex md:w-60 lg:w-64`}
    >
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
              {section === "channel" ? (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Create channel"
                  title="Create channel"
                  onClick={() => onCreate("channel")}
                >
                  <Plus />
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="New message"
                      title="New message"
                    >
                      <Plus />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onCreate("dm")}>
                      New direct message
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onCreate("group")}>
                      New group message
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {loading && (
              <div role="status" className="space-y-2 px-2 py-2">
                <span className="sr-only">
                  {section === "channel" ? "Loading channels…" : "Loading direct messages…"}
                </span>
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    aria-hidden="true"
                    className="h-7 rounded-md bg-muted motion-safe:animate-pulse"
                  />
                ))}
              </div>
            )}
            {!loading &&
              conversations
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
                      variant="sidebar"
                      className="mb-1 w-full justify-start"
                      aria-current={selectedId === conversation.id ? "page" : undefined}
                      onClick={() => onSelect(conversation.id)}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{conversationName(conversation)}</span>
                    </Button>
                  );
                })}
            {!loading &&
              !conversations.some((conversation) =>
                section === "channel"
                  ? conversation.kind === "channel"
                  : conversation.kind !== "channel",
              ) && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  {section === "channel" ? "No channels yet" : "No conversations yet"}
                </p>
              )}
          </section>
        ))}
      </div>
    </aside>
  );
}
