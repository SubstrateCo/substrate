import { ErrorState } from "../feedback/error-state";
import { isAccessFailure } from "../feedback/request-failure";
import type { Conversation } from "./types";
import { ConversationSection } from "@/components/messaging/conversation-sidebar/conversation-section";

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
  return (
    <aside
      id="conversation-sidebar"
      aria-label="Conversations"
      aria-busy={loading}
      className={`${mobileOpen ? "flex" : "hidden"} min-h-0 w-full min-w-0 flex-1 flex-col bg-sidebar text-sidebar-foreground md:flex md:h-full`}
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
            <ConversationSection
              key={section}
              section={section}
              conversations={conversations}
              selectedId={selectedId}
              loading={loading}
              onSelect={onSelect}
              onCreate={onCreate}
            />
          ))}
      </div>
    </aside>
  );
}
