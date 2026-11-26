import type { AgentCallMode } from "@substrate/contracts/agents";

import { View } from "react-native";

import { PanelSheet } from "../shared/panel-sheet";
import { PersonAvatar } from "../shared/person-avatar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useMessagingProfile } from "@/features/messaging/queries/use-conversations";
import { ErrorState, LoadingRows } from "@/features/records/ui/states";

const callModes: Record<AgentCallMode, string> = {
  anyone: "Anyone here can call this agent",
  ask: "Calls need the owner's approval",
};

/** A person or agent as this conversation lets the viewer see them. */
export function ProfileSheet({
  organizationId,
  conversationId,
  actorId,
  onMessage,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  actorId: string;
  onMessage?: (conversationId: string) => void;
  onClose: () => void;
}) {
  const profile = useMessagingProfile(organizationId, conversationId, actorId);
  const data = profile.data;
  return (
    <PanelSheet title={data?.name ?? "Profile"} onClose={onClose}>
      {profile.isPending ? <LoadingRows rows={2} label="Loading profile" /> : null}
      {profile.error ? (
        <ErrorState
          error={profile.error}
          noun="this profile"
          onRetry={() => void profile.refetch()}
        />
      ) : null}
      {data ? (
        <View className="gap-4">
          <View className="flex-row items-center gap-3">
            <PersonAvatar name={data.name} image={data.image} agent={data.type === "agent"} />
            <View className="flex-1">
              <Text className="text-base font-semibold">
                {data.self ? `${data.name} (you)` : data.name}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {[
                  data.type === "agent" ? "Agent" : data.role,
                  data.external ? "Outside this workspace" : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Member"}
              </Text>
            </View>
          </View>
          {data.email ? (
            <Text className="text-sm" selectable>
              {data.email}
            </Text>
          ) : null}
          {data.agent?.ownerName ? (
            <Text className="text-sm text-muted-foreground">{`Owned by ${data.agent.ownerName}`}</Text>
          ) : null}
          {data.agent?.callMode ? (
            <Text className="text-sm text-muted-foreground">{callModes[data.agent.callMode]}</Text>
          ) : null}
          {data.agent?.model ? (
            <Text className="text-sm text-muted-foreground">{`Model: ${data.agent.model}`}</Text>
          ) : null}
          {data.directConversationId && onMessage ? (
            <Button onPress={() => onMessage(data.directConversationId!)}>
              <Text>Message</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </PanelSheet>
  );
}
