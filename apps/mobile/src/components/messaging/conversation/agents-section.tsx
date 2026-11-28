import { View } from "react-native";

import { AgentFace } from "../shared/agent-face";
import { SheetSection } from "../shared/panel-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { conversationAgentOptions } from "@/features/messaging/conversations/conversation-rules";
import type { Agent, ConversationMember } from "@/features/messaging/types";
import { ErrorState, LoadingRows, MutationError } from "@/features/records/ui/states";
import { Palette } from "lucide-react-native";

export function AgentsSection({
  agents,
  members,
  loading,
  loadError,
  error,
  busyId,
  onAdd,
  onRemove,
  onAppearance,
}: {
  agents: Agent[] | undefined;
  members: ConversationMember[];
  loading: boolean;
  loadError: Error | null;
  error: Error | null;
  busyId?: string;
  onAdd: (agentId: string) => void;
  onRemove: (actorId: string) => void;
  onAppearance: (agentId: string) => void;
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
          <AgentFace
            name={option.name}
            code={agents?.find((agent) => agent.id === option.agentId)?.avatar ?? null}
            size="sm"
          />
          <Text className="flex-1 text-[15px]" numberOfLines={1}>
            {option.name}
          </Text>
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel={`Change how ${option.name} looks`}
            onPress={() => onAppearance(option.agentId)}
          >
            <Icon as={Palette} className="size-5 text-muted-foreground" />
          </Button>
          {option.actorId ? (
            <Button
              variant="outline"
              size="sm"
              className="min-w-20"
              disabled={!!busyId}
              onPress={() => onRemove(option.actorId!)}
            >
              <Text>{busyId === option.agentId ? "Removing." : "Remove"}</Text>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="min-w-20"
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
