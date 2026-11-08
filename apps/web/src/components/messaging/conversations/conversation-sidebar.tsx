import { ErrorState } from "../../feedback/error-state";
import { isAccessFailure } from "../../feedback/request-failure";
import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import type { DirectMessagePerson } from "@/components/messaging/conversations/conversation-sidebar/conversation-create-menu";
import { ConversationSection } from "@/components/messaging/conversations/conversation-sidebar/conversation-section";
import type { Conversation } from "@/lib/messaging/conversations";
import { cn } from "cn";

export function ConversationSidebar({
  conversations,
  selectedId,
  people,
  onSelect,
  onCreate,
  mobileOpen,
  loading = false,
  error,
  onRetry,
}: {
  conversations: Conversation[];
  selectedId?: string;
  people?: DirectMessagePerson[];
  onSelect: (id: string) => void;
  onCreate: (kind: Conversation["kind"], recipient?: string) => void;
  mobileOpen: boolean;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  return (
    <PageSidebar
      id="conversation-sidebar"
      aria-label="Conversations"
      aria-busy={loading}
      width="fill"
      className={cn("flex-1 max-md:h-auto", !mobileOpen && "hidden md:flex")}
    >
      <PageSidebarHeader title="Messages" />
      <PageSidebarContent className="pt-0">
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
              people={people}
              onSelect={onSelect}
              onCreate={onCreate}
            />
          ))}
      </PageSidebarContent>
    </PageSidebar>
  );
}
