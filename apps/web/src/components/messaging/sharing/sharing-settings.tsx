import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import {
  SettingsCard,
  SettingsList,
  SettingsNote,
  SettingsSection,
} from "@/components/layout/settings-section";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { SharingManager } from "@/components/messaging/sharing/sharing-manager";
import { Button } from "@/components/ui/button";
import { sharingConversationOptions, sharingInboxOptions } from "@/queries/messaging/sharing";
import { Globe } from "lucide-react";

export function SharingSettings({ organizationId }: { organizationId: string }) {
  const conversations = useQuery(sharingConversationOptions(organizationId));
  const inbox = useQuery(sharingInboxOptions(organizationId));
  const [selected, setSelected] = useState<string>();
  return (
    <SettingsSection
      title="External collaboration"
      description="Approve partner channels, manage invitations, or disconnect organizations."
    >
      {(conversations.isPending || inbox.isPending) && (
        <LoadingState label="Loading collaboration…" rows={2} />
      )}
      {(conversations.error || inbox.error) && (
        <ErrorState
          title="Couldn’t load collaboration"
          onRetry={() => {
            void conversations.refetch();
            void inbox.refetch();
          }}
        />
      )}
      <SettingsCard title="Requests">
        {inbox.data?.length === 0 && <SettingsNote>No pending requests.</SettingsNote>}
        {inbox.data?.map((invite) => (
          <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm wrap-anywhere">
              {invite.name ?? "Conversation"} · {invite.email}
            </p>
            <Button asChild variant="outline">
              <a href={`/accept-sharing/${invite.id}`}>Review</a>
            </Button>
          </div>
        ))}
      </SettingsCard>
      <SettingsCard title="Shared conversations">
        {conversations.data?.length === 0 && (
          <SettingsNote>No conversations to manage.</SettingsNote>
        )}
        {!!conversations.data?.length && (
          <SettingsList>
            {conversations.data.map((conversation) => (
              <li
                key={conversation.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2"
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
                <Button variant="ghost" onClick={() => setSelected(conversation.id)}>
                  Manage
                </Button>
              </li>
            ))}
          </SettingsList>
        )}
      </SettingsCard>
      {selected && (
        <SharingManager
          organizationId={organizationId}
          conversationId={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </SettingsSection>
  );
}
