import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { isAccessFailure } from "@/api/access-failure";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { SettingsPanel } from "@/components/layout/settings-page";
import { SettingsCard, SettingsNote } from "@/components/layout/settings-section";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { SharingManager } from "@/components/messaging/sharing/sharing-manager";
import { Button } from "@/components/ui/button";
import { sharingConversationOptions, sharingInboxOptions } from "@/queries/messaging/sharing";
import { Globe } from "lucide-react";

export function SharingSettings({ organizationId }: { organizationId: string }) {
  const conversations = useQuery(sharingConversationOptions(organizationId));
  const inbox = useQuery(sharingInboxOptions(organizationId));
  const { value: selected, open, close, restoreFocus } = useStateDialog<string>();
  const blocked = isAccessFailure(conversations.error) || isAccessFailure(inbox.error);
  if (blocked && selected !== undefined) close();
  const retry = () => {
    void conversations.refetch();
    void inbox.refetch();
  };
  return (
    <SettingsPanel
      title="External collaboration"
      description="Approve partner channels, manage invitations, or disconnect organizations."
    >
      <CollaborationLoadNotice
        loading={conversations.isPending || inbox.isPending}
        failed={!!(conversations.error || inbox.error)}
        blocked={blocked}
        hasLists={!!(conversations.data && inbox.data)}
        onRetry={retry}
      />
      {!blocked && (
        <SettingsCard title="Requests">
          {inbox.data?.length === 0 && <SettingsNote>No pending requests.</SettingsNote>}
          {inbox.data?.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm wrap-anywhere">
                {invite.name ?? "Conversation"} · {invite.email}
              </p>
              <Button asChild variant="outline">
                <Link to="/accept-sharing/$invitationId" params={{ invitationId: invite.id }}>
                  Review
                </Link>
              </Button>
            </div>
          ))}
        </SettingsCard>
      )}
      {!blocked && (
        <SettingsCard title="Shared conversations">
          {conversations.data?.length === 0 && (
            <SettingsNote>No conversations to manage.</SettingsNote>
          )}
          {!!conversations.data?.length && (
            <ul aria-label="Shared conversations" className="divide-y">
              {conversations.data.map((conversation) => (
                <li
                  key={conversation.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    {conversation.kind === "channel" ? (
                      <Globe aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ConversationKindIcon
                        kind={conversation.kind}
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    )}
                    {conversation.name ?? "Direct message"}
                  </span>
                  <Button variant="ghost" onClick={() => open(conversation.id)}>
                    Manage
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SettingsCard>
      )}
      {selected && !blocked && (
        <SharingManager
          organizationId={organizationId}
          conversationId={selected}
          onClose={close}
          onRestoreFocus={restoreFocus}
        />
      )}
    </SettingsPanel>
  );
}

function CollaborationLoadNotice({
  loading,
  failed,
  blocked,
  hasLists,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  blocked: boolean;
  hasLists: boolean;
  onRetry: () => void;
}) {
  let notice;
  if (failed)
    notice =
      !blocked && hasLists ? (
        <StaleNotice onRetry={onRetry}>This information may be out of date.</StaleNotice>
      ) : (
        <ErrorState
          title="Couldn’t load collaboration"
          description={
            blocked
              ? "You no longer have access to collaboration settings."
              : "This information may be out of date."
          }
          onRetry={blocked ? undefined : onRetry}
        />
      );
  return (
    <>
      {loading && <LoadingState label="Loading collaboration…" rows={2} />}
      {notice}
    </>
  );
}
