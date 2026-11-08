import { isAccessFailure } from "../../feedback/request-failure";
import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { PageSidebarErrorState } from "@/components/layout/page-sidebar-error-state";
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
  const errorState = error && (
    <PageSidebarErrorState title="Couldn’t load conversations" error={error} onRetry={onRetry} />
  );
  const showList = !isAccessFailure(error) && (!error || conversations.length > 0);
  return (
    <PageSidebar
      id="conversation-sidebar"
      aria-label="Conversations"
      aria-busy={loading}
      width="fill"
      className={cn("flex-1 max-md:h-auto", !mobileOpen && "hidden md:flex")}
    >
      <PageSidebarHeader title="Messages" />
      {showList ? (
        <PageSidebarContent className="pt-0">
          {errorState}
          {(["channel", "partner", "dm"] as const).map((section) => (
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
      ) : (
        errorState
      )}
    </PageSidebar>
  );
}
