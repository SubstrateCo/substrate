import { View } from "react-native";

import { SheetSection } from "../shared/panel-sheet";
import { PersonAvatar } from "../shared/person-avatar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { conversationAgentOptions } from "@/features/messaging/conversations/conversation-rules";
import type { Agent, ConversationMember } from "@/features/messaging/types";
import { ErrorState, LoadingRows, MutationError } from "@/features/records/ui/states";

/** The viewer's own agents: add them here or take them out. Other people's agents are theirs. */
export function AgentsSection({
  agents,
  members,
  loading,
  loadError,
  error,
  busyId,
  onAdd,
  onRemove,
}: {
  agents: Agent[] | undefined;
  members: ConversationMember[];
  loading: boolean;
  loadError: Error | null;
  error: Error | null;
  busyId?: string;
  onAdd: (agentId: string) => void;
  onRemove: (actorId: string) => void;
}) {
  const options = conversationAgentOptions(agents ?? [], members);
  return (
    <SheetSection title="Your agents">
      {loading ? <LoadingRows rows={2} label="Loading your agents" /> : null}
      {loadError ? <ErrorState compact error={loadError} noun="your agents" /> : null}
      <MutationError error={error} />
      {!loading && !options.length ? (
        <Text className="py-2 text-sm text-muted-foreground">You have no enabled agents.</Text>
      ) : null}
      {options.map((option) => (
        <View key={option.agentId} className="min-h-12 flex-row items-center gap-3">
          <PersonAvatar
            name={option.name}
            image={agents?.find((agent) => agent.id === option.agentId)?.image}
            agent
            size="sm"
          />
          <Text className="flex-1 text-[15px]" numberOfLines={1}>
            {option.name}
          </Text>
          {option.actorId ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!!busyId}
              onPress={() => onRemove(option.actorId!)}
            >
              <Text>{busyId === option.agentId ? "Removing." : "Remove"}</Text>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={!!busyId}
              onPress={() => onAdd(option.agentId)}
            >
              <Text>{busyId === option.agentId ? "Adding." : "Add"}</Text>
            </Button>
          )}
        </View>
      ))}
    </SheetSection>
  );
}
