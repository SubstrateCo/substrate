import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { SharingManager } from "@/components/messaging/sharing/sharing-manager";
import { Button } from "@/components/ui/button";
import { sharingConversationOptions, sharingInboxOptions } from "@/queries/messaging/sharing";

export function SharingSettings({ organizationId }: { organizationId: string }) {
  const conversations = useQuery(sharingConversationOptions(organizationId));
  const inbox = useQuery(sharingInboxOptions(organizationId));
  const [selected, setSelected] = useState<string>();
  return (
    <section className="space-y-6">
      <PageHeader
        title="External collaboration"
        description="Approve partner channels, manage invitations, or disconnect organizations. Existing external participants need reapproval."
      />
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
      <section className="space-y-3">
        <h3 className="font-medium">Incoming invitations and approval requests</h3>
        {inbox.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        )}
        {inbox.data?.map((invite) => (
          <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm wrap-anywhere">
              {invite.name ?? "Conversation"} · {invite.email}
            </p>
            <Button asChild variant="outline">
              <a href={`/accept-sharing/${invite.id}`}>Review invitation</a>
            </Button>
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <h3 className="font-medium">Manage conversation sharing</h3>
        {conversations.data?.map((conversation) => (
          <div key={conversation.id} className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">{conversation.name ?? "Direct message"}</span>
            <Button variant="outline" onClick={() => setSelected(conversation.id)}>
              Manage sharing
            </Button>
          </div>
        ))}
      </section>
      {selected && (
        <SharingManager
          organizationId={organizationId}
          conversationId={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </section>
  );
}
