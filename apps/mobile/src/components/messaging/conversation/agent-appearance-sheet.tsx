import {
  BODIES,
  BODY_COLOR_NAMES,
  decodeAvatarCode,
  withAvatarChoices,
  type AvatarChoices,
} from "@substrate/agent-avatars/config";
import { AgentAvatar } from "@substrate/agent-avatars/native";

import type { ReactNode } from "react";
import { View } from "react-native";

import { useAgentAvatarTheme } from "../shared/agent-face";
import { PanelSheet, SheetSection } from "../shared/panel-sheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useSetAgentAvatar } from "@/features/messaging/queries/use-agent-avatar";
import { useOwnAgents } from "@/features/messaging/queries/use-conversations";
import { ErrorState, LoadingRows, MutationError } from "@/features/records/ui/states";
import { cn } from "@/lib/utils";

const TILE_SIZE = 32;
const PREVIEW_SIZE = 112;

const title = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

function ChoiceTile({
  label,
  code,
  selected,
  onPress,
}: {
  label: string;
  code: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useAgentAvatarTheme();
  const look = code ? decodeAvatarCode(code) : null;
  let face: ReactNode = null;
  if (look)
    face = <AgentAvatar {...look} {...theme} size={TILE_SIZE} ambient="off" animated={false} />;
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("rounded-lg", selected && "border-2 border-primary dark:border-primary")}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
    >
      {face}
    </Button>
  );
}

export function AgentAppearanceSheet({
  organizationId,
  agentId,
  onClose,
}: {
  organizationId: string;
  agentId: string;
  onClose: () => void;
}) {
  const agents = useOwnAgents(organizationId);
  const save = useSetAgentAvatar(organizationId);
  const theme = useAgentAvatarTheme();
  const agent = agents.data?.find((candidate) => candidate.id === agentId);
  const look = agent ? decodeAvatarCode(agent.avatar) : null;

  if (!agent || !look) {
    return (
      <PanelSheet title="Appearance" onClose={onClose}>
        {agents.isPending ? <LoadingRows rows={2} label="Loading your agent" /> : null}
        {agents.error ? (
          <ErrorState
            error={agents.error}
            noun="your agent"
            onRetry={() => void agents.refetch()}
          />
        ) : null}
        {agents.data ? (
          <Text className="text-sm text-muted-foreground">
            {agent ? "This agent's look can't be shown." : "This agent is no longer yours."}
          </Text>
        ) : null}
      </PanelSheet>
    );
  }

  const choose = (choices: AvatarChoices) => {
    const avatar = withAvatarChoices(agent.avatar, choices);
    if (avatar && avatar !== agent.avatar) save.mutate({ id: agent.id, avatar });
  };

  return (
    <PanelSheet title="Appearance" onClose={onClose}>
      <View className="items-center gap-2 py-2">
        <AgentAvatar
          {...look}
          {...theme}
          size={PREVIEW_SIZE}
          ambient="lively"
          animated
          interactive
          label={agent.name}
        />
        <Text className="text-base font-semibold">{agent.name}</Text>
      </View>
      <MutationError error={save.error} />
      <SheetSection title="Shape">
        <View className="flex-row flex-wrap gap-2 pt-1">
          {BODIES.map((body) => (
            <ChoiceTile
              key={body}
              label={`Shape: ${title(body)}`}
              code={withAvatarChoices(agent.avatar, { body })}
              selected={look.body === body}
              onPress={() => choose({ body })}
            />
          ))}
        </View>
      </SheetSection>
      <SheetSection title="Colour">
        <View className="flex-row flex-wrap gap-2 pt-1">
          {BODY_COLOR_NAMES.map((color) => (
            <ChoiceTile
              key={color}
              label={`Colour: ${title(color)}`}
              code={withAvatarChoices(agent.avatar, { color })}
              selected={look.color === color}
              onPress={() => choose({ color })}
            />
          ))}
        </View>
      </SheetSection>
    </PanelSheet>
  );
}
