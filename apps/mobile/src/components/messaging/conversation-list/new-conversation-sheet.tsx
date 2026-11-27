import type { PickerAgent, PickerPerson } from "@substrate/contracts/people/picker";
import { matchPeople } from "@substrate/contracts/people/picker";

import { useState } from "react";
import { FlatList, View } from "react-native";

import { AgentFace } from "../shared/agent-face";
import { PanelSheet } from "../shared/panel-sheet";
import { PersonAvatar } from "../shared/person-avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { MutationError } from "@/features/records/ui/states";
import { Compass, Hash, Mail, Users } from "lucide-react-native";

export type NewConversationChoice =
  | { kind: "person"; person: PickerPerson }
  | { kind: "agent"; agent: PickerAgent }
  | { kind: "create"; conversation: "dm" | "group" | "channel" }
  | { kind: "browse" };

type Item =
  | { key: string; type: "header"; label: string }
  | { key: string; type: "choice"; label: string; detail?: string; choice: NewConversationChoice };

function ChoiceRow({
  item,
  disabled,
  onPress,
}: {
  item: Extract<Item, { type: "choice" }>;
  disabled: boolean;
  onPress: () => void;
}) {
  const { choice } = item;
  let leading;
  if (choice.kind === "person")
    leading = <PersonAvatar name={choice.person.name} image={choice.person.image} size="sm" />;
  else if (choice.kind === "agent")
    leading = <AgentFace name={choice.agent.name} code={choice.agent.avatar} size="sm" />;
  else {
    const icon = { dm: Mail, group: Users, channel: Hash, browse: Compass }[
      choice.kind === "create" ? choice.conversation : "browse"
    ];
    leading = <Icon as={icon} className="size-4 text-muted-foreground" />;
  }
  return (
    <Button
      variant="ghost"
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className="min-h-12 flex-row items-center justify-start gap-3 rounded-none px-4 py-0 active:bg-accent"
    >
      <View className="w-6 items-center">{leading}</View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px]">
          {item.label}
        </Text>
        {item.detail ? (
          <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {item.detail}
          </Text>
        ) : null}
      </View>
    </Button>
  );
}

export function NewConversationSheet({
  people,
  agents,
  pending,
  error,
  canBrowse,
  onChoose,
  onClose,
}: {
  people: PickerPerson[];
  agents: PickerAgent[];
  pending: boolean;
  error: unknown;
  canBrowse: boolean;
  onChoose: (choice: NewConversationChoice) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const matches = matchPeople(people, query, []);
  const agentMatches = agents.filter(
    (agent) => !search || agent.name.toLowerCase().includes(search),
  );
  const items: Item[] = [
    { key: "create-header", type: "header", label: "Start" },
    {
      key: "dm",
      type: "choice",
      label: "New direct message",
      detail: "Message one person, inside or outside this workspace",
      choice: { kind: "create", conversation: "dm" },
    },
    {
      key: "group",
      type: "choice",
      label: "New group message",
      choice: { kind: "create", conversation: "group" },
    },
    {
      key: "channel",
      type: "choice",
      label: "New channel",
      choice: { kind: "create", conversation: "channel" },
    },
    ...(canBrowse
      ? [
          {
            key: "browse",
            type: "choice" as const,
            label: "Browse channels",
            choice: { kind: "browse" as const },
          },
        ]
      : []),
    { key: "people-header", type: "header", label: "People" },
    ...matches.map((person): Item => ({
      key: `person-${person.id}`,
      type: "choice",
      label: person.name,
      detail: person.email,
      choice: { kind: "person", person },
    })),
    ...(agentMatches.length
      ? [{ key: "agents-header", type: "header" as const, label: "Your agents" }]
      : []),
    ...agentMatches.map((agent): Item => ({
      key: `agent-${agent.id}`,
      type: "choice",
      label: agent.name,
      choice: { kind: "agent", agent },
    })),
  ];
  return (
    <PanelSheet title="New message" onClose={onClose} scroll={false}>
      <View className="gap-2 border-b border-border p-3">
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search people and agents"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search people and agents"
        />
        <MutationError error={error} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          !matches.length ? (
            <Text className="px-4 py-3 text-sm text-muted-foreground">
              {search ? "No one here matches." : "No one else is in this workspace yet."}
            </Text>
          ) : null
        }
        renderItem={({ item }) =>
          item.type === "header" ? (
            <Text
              className="px-4 pb-1 pt-4 text-xs font-medium text-muted-foreground"
              accessibilityRole="header"
            >
              {item.label}
            </Text>
          ) : (
            <ChoiceRow item={item} disabled={pending} onPress={() => onChoose(item.choice)} />
          )
        }
      />
    </PanelSheet>
  );
}
