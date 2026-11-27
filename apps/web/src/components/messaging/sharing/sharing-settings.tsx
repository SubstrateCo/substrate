import type { SharedConversationStatus } from "@substrate/contracts/messaging/sharing";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { isAccessFailure } from "@/api/access-failure";
import type { SharedConversation, SharingRequest } from "@/api/messaging/sharing";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { ListBody } from "@/components/feedback/list-body";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { Tag } from "@/components/feedback/tag";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { SettingsPanel } from "@/components/layout/settings-page";
import { SettingsCard } from "@/components/layout/settings-section";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { SharingManager } from "@/components/messaging/sharing/sharing-manager";
import { Button } from "@/components/ui/button";
import { listPhase, type ListPhase } from "@/lib/resource-state";
import { sharingConversationOptions, sharingInboxOptions } from "@/queries/messaging/sharing";
import { Globe, Inbox } from "lucide-react";

export function SharingSettings({ organizationId }: { organizationId: string }) {
  const conversations = useQuery(sharingConversationOptions(organizationId));
  const inbox = useQuery(sharingInboxOptions(organizationId));
  const { value: selected, open, close, restoreFocus } = useStateDialog<string>();
  const blocked = isAccessFailure(conversations.error) || isAccessFailure(inbox.error);
  // Lost access discards the open dialog for good, so it can't reopen if access returns. Closing
  // during render resets it before the blocked render could show it.
  if (blocked && selected !== undefined) close();
  const selectedConversation = conversations.data?.find((row) => row.id === selected);
  const retry = () => {
    void conversations.refetch();
    void inbox.refetch();
  };
  if (blocked)
    return (
      <CollaborationPanel>
        <ErrorState
          title="Couldn’t load collaboration"
          description="You no longer have access to collaboration settings."
        />
      </CollaborationPanel>
    );
  return (
    <CollaborationPanel>
      <SharingRequestsCard
        phase={listPhase({ items: inbox.data, loading: inbox.isPending, error: inbox.error })}
        onRetry={retry}
      />
      <SharedConversationsCard
        phase={listPhase({
          items: conversations.data,
          loading: conversations.isPending,
          error: conversations.error,
        })}
        onRetry={retry}
        onManage={open}
      />
      {selected && (
        <SharingManager
          organizationId={organizationId}
          conversationId={selected}
          name={selectedConversation && sharedConversationName(selectedConversation)}
          onClose={close}
          onRestoreFocus={restoreFocus}
        />
      )}
    </CollaborationPanel>
  );
}

function CollaborationPanel({ children }: { children: ReactNode }) {
  return (
    <SettingsPanel
      title="External collaboration"
      description="Approve partner channels, manage invitations, or disconnect organizations."
    >
      {children}
    </SettingsPanel>
  );
}

function SharingRequestsCard({
  phase,
  onRetry,
}: {
  phase: ListPhase<SharingRequest>;
  onRetry: () => void;
}) {
  return (
    <SettingsCard title="Requests">
      <ListBody
        phase={phase}
        loading={
          <div role="status" aria-label="Loading requests">
            <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-3">
              <SharingRequestContent title={<SkeletonText width="12rem" />} />
            </div>
          </div>
        }
        error={<ErrorState variant="compact" title="Couldn’t load requests" onRetry={onRetry} />}
        empty={
          <ContentNotice
            variant="compact"
            icon={Inbox}
            title="No pending requests"
            description="Invitations from other organizations to share a conversation appear here."
          />
        }
        stale={<StaleNotice title="This information may be out of date." onRetry={onRetry} />}
      >
        {(requests) =>
          requests.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
              <SharingRequestContent
                title={
                  <>
                    {invite.name ?? "Conversation"} · {invite.email}
                  </>
                }
                action={
                  <Button asChild variant="outline">
                    <Link to="/accept-sharing/$invitationId" params={{ invitationId: invite.id }}>
                      Review
                    </Link>
                  </Button>
                }
              />
            </div>
          ))
        }
      </ListBody>
    </SettingsCard>
  );
}

function SharedConversationsCard({
  phase,
  onRetry,
  onManage,
}: {
  phase: ListPhase<SharedConversation>;
  onRetry: () => void;
  onManage: (conversationId: string) => void;
}) {
  return (
    <SettingsCard title="Shared conversations">
      <ListBody
        phase={phase}
        loading={
          <div role="status" aria-label="Loading shared conversations">
            <ul aria-hidden="true" className="divide-y">
              <li className="flex flex-wrap items-center justify-between gap-3 py-2">
                <SharedConversationTitle
                  icon={<SkeletonText width="1rem" />}
                  title={<SkeletonText width="10rem" />}
                />
              </li>
            </ul>
          </div>
        }
        error={
          <ErrorState
            variant="compact"
            title="Couldn’t load shared conversations"
            onRetry={onRetry}
          />
        }
        empty={
          <ContentNotice
            variant="compact"
            icon={Globe}
            title="No conversations to manage"
            description="Conversations shared with other organizations appear here."
          />
        }
        stale={<StaleNotice title="This information may be out of date." onRetry={onRetry} />}
      >
        {(conversations) => (
          <ul aria-label="Shared conversations" className="divide-y">
            {conversations.map((conversation) => (
              <li
                key={conversation.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <SharedConversationTitle
                  icon={
                    conversation.kind === "channel" ? (
                      <Globe aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ConversationKindIcon
                        kind={conversation.kind}
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    )
                  }
                  title={sharedConversationTitle(conversation)}
                  details={sharedConversationDetails(conversation)}
                  status={
                    conversation.status && <Tag>{sharedStatusLabels[conversation.status]}</Tag>
                  }
                />
                <Button variant="ghost" onClick={() => onManage(conversation.id)}>
                  Manage
                </Button>
              </li>
            ))}
          </ul>
        )}
      </ListBody>
    </SettingsCard>
  );
}

function SharingRequestContent({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <>
      <p className="text-sm wrap-anywhere">{title}</p>
      {action}
    </>
  );
}

const sharedStatusLabels: Record<SharedConversationStatus, string> = {
  connected: "Connected",
  "needs-approval": "Needs approval",
  invited: "Invited",
};

// The server names only conversations the viewer may open. Undefined means a placeholder.
function sharedConversationName(conversation: SharedConversation) {
  if (conversation.displayName) return conversation.displayName;
  if (conversation.accessible)
    return conversation.kind === "dm" ? "Direct message" : "Group conversation";
}

function sharedConversationTitle(conversation: SharedConversation) {
  return (
    sharedConversationName(conversation) ?? (
      <span className="text-muted-foreground">A conversation you can’t open</span>
    )
  );
}

function sharedConversationDetails(conversation: SharedConversation) {
  const { partnerOrganizationName, partnerOrganizationCount, participantCount } = conversation;
  const parts: string[] = [];
  if (partnerOrganizationName)
    parts.push(
      partnerOrganizationCount > 1
        ? `${partnerOrganizationName} and ${partnerOrganizationCount - 1} more`
        : partnerOrganizationName,
    );
  if (participantCount !== null)
    parts.push(`${participantCount} ${participantCount === 1 ? "member" : "members"}`);
  return parts.join(" · ");
}

function SharedConversationTitle({
  icon,
  title,
  details,
  status,
}: {
  icon: ReactNode;
  title: ReactNode;
  details?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
      {icon}
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="wrap-anywhere">{title}</span>
          {status}
        </span>
        {details && <span className="block truncate text-xs text-muted-foreground">{details}</span>}
      </span>
    </span>
  );
}
