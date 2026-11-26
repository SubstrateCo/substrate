import { useState } from "react";
import { View } from "react-native";

import { PanelSheet } from "../shared/panel-sheet";
import { InvitationReview } from "./invitation-review";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { SharingRequest } from "@/features/messaging/types";
import { EmptyState } from "@/features/records/ui/states";
import { ChevronLeft } from "lucide-react-native";

/** Invitations from other organizations, and the review of one. */
export function SharingRequestsSheet({
  organizationId,
  requests,
  onOpenConversation,
  onClose,
}: {
  organizationId: string;
  requests: SharingRequest[];
  onOpenConversation: (conversationId: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string>();
  return (
    <PanelSheet title="Invitations" onClose={onClose}>
      {selected ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onPress={() => setSelected(undefined)}
          >
            <Icon as={ChevronLeft} className="size-4 text-foreground" />
            <Text>All invitations</Text>
          </Button>
          <InvitationReview
            organizationId={organizationId}
            invitationId={selected}
            onOpenConversation={onOpenConversation}
          />
        </>
      ) : null}
      {!selected && requests.length ? (
        <View>
          {requests.map((request) => (
            <Button
              variant="ghost"
              key={request.id}
              accessibilityRole="button"
              onPress={() => setSelected(request.id)}
              className="min-h-14 flex-col items-start justify-center gap-0 rounded-none border-b border-border px-1 py-2 active:bg-accent"
            >
              <Text className="text-[15px]" numberOfLines={1}>
                {request.name ?? "Conversation"}
              </Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {request.purpose === "organization"
                  ? `For your workspace · ${request.email}`
                  : `For ${request.email}`}
              </Text>
            </Button>
          ))}
        </View>
      ) : null}
      {!selected && !requests.length ? (
        <EmptyState
          title="No pending invitations"
          description="Invitations from other organizations to share a conversation appear here."
        />
      ) : null}
    </PanelSheet>
  );
}
