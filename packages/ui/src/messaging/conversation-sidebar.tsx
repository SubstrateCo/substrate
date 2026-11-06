import { Plus } from "lucide-react";
import { useRef } from "react";
import type { Conversation } from "./types";
import { ConversationSidebarItem } from "./conversation-sidebar-item";
import { Button } from "../primitives/button";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../primitives/dropdown-menu";

const sectionLabels = { channel: "Channels", partner: "Partner channels", dm: "Direct messages" };
const emptyLabels = {
  channel: "No channels yet",
  partner: "No partner channels yet",
  dm: "No conversations yet",
};
function inSection(conversation: Conversation, section: keyof typeof sectionLabels) {
  if (section === "dm") return conversation.kind !== "channel";
  return conversation.kind === "channel" && !!conversation.partner === (section === "partner");
}

export function ConversationSidebar({
  conversations,
  selectedId,
  onSelect,
  onCreate,
  mobileOpen,
  loading = false,
  error,
  onRetry,
}: {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onCreate: (kind: Conversation["kind"]) => void;
  mobileOpen: boolean;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const creatingFromMenu = useRef<Conversation["kind"] | null>(null);
  return (
    <aside
      id="conversation-sidebar"
      aria-label="Conversations"
      aria-busy={loading}
      className={`${mobileOpen ? "flex" : "hidden"} h-full min-w-0 w-full shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex`}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {error && (
          <ErrorState
            compact
            title="Couldn’t load conversations"
            description="Try again to update your channels and messages."
            onRetry={onRetry}
          />
        )}
        {!isAccessFailure(error) &&
          (!error || conversations.length > 0) &&
          (["channel", "partner", "dm"] as const).map((section) => (
            <section key={section} aria-label={sectionLabels[section]}>
              <div className="mb-1 flex items-center justify-between px-2">
                <h2 className="text-xs font-semibold text-muted-foreground">
                  {sectionLabels[section]}
                </h2>
                {section === "channel" && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Create channel"
                    data-create-conversation="sidebar-channel"
                    title="Create channel"
                    onClick={() => onCreate("channel")}
                  >
                    <Plus />
                  </Button>
                )}
                {section === "dm" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="New message"
                        data-create-conversation="sidebar-message"
                        title="New message"
                      >
                        <Plus />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onCloseAutoFocus={(event) => {
                        const kind = creatingFromMenu.current;
                        if (kind) {
                          event.preventDefault();
                          creatingFromMenu.current = null;
                          onCreate(kind);
                        }
                      }}
                    >
                      <DropdownMenuItem
                        onSelect={() => {
                          creatingFromMenu.current = "dm";
                        }}
                      >
                        New direct message
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          creatingFromMenu.current = "group";
                        }}
                      >
                        New group message
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {loading && conversations.length === 0 && (
                <LoadingState
                  label={section === "dm" ? "Loading direct messages…" : "Loading channels…"}
                  variant="compact"
                />
              )}
              {conversations
                .filter((conversation) => inSection(conversation, section))
                .map((conversation) => (
                  <ConversationSidebarItem
                    key={conversation.id}
                    conversation={conversation}
                    selected={selectedId === conversation.id}
                    onSelect={() => onSelect(conversation.id)}
                  />
                ))}
              {!loading &&
                !conversations.some((conversation) => inSection(conversation, section)) && (
                  <p className="px-2 py-2 text-xs text-muted-foreground">{emptyLabels[section]}</p>
                )}
            </section>
          ))}
      </div>
    </aside>
  );
}
