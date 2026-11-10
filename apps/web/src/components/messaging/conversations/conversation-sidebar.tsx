import { isAccessFailure } from "../../feedback/request-failure";
import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { PageSidebarErrorState } from "@/components/layout/page-sidebar-error-state";
import type {
  DirectMessageAgent,
  DirectMessagePerson,
} from "@/components/messaging/conversations/conversation-create-menu";
import { ConversationSection } from "@/components/messaging/conversations/conversation-section";
import type { Conversation } from "@/lib/messaging/conversations";

export function ConversationSidebar({
  conversations,
  selectedId,
  people,
  agents,
  onSelect,
  onCreate,
  onMessageAgent,
  loading = false,
  error,
  onRetry,
}: {
  conversations: Conversation[];
  selectedId?: string;
  people?: DirectMessagePerson[];
  agents?: DirectMessageAgent[];
  onSelect: (id: string) => void;
  onCreate: (kind: Conversation["kind"], recipient?: string) => void;
  onMessageAgent?: (agent: DirectMessageAgent) => void;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const errorState = error && (
    <PageSidebarErrorState title="Couldn’t load conversations" error={error} onRetry={onRetry} />
  );
  const showList = !isAccessFailure(error) && (!error || conversations.length > 0);
  return (
    <PageSidebar id="conversation-sidebar" aria-label="Conversations" aria-busy={loading}>
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
              agents={agents}
              onSelect={onSelect}
              onCreate={onCreate}
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
