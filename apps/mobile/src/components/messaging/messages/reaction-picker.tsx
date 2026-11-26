import { emojiCategories } from "@substrate/contracts/messaging/emoji";

import { useState } from "react";
import { View } from "react-native";

import { PanelSheet, SheetSection } from "../shared/panel-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/** Uses the same named palette as the desktop message picker. */
export function ReactionPicker({
  reacted,
  onPick,
  onClose,
}: {
  reacted: ReadonlySet<string>;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const groups = emojiCategories
    .map((group) => ({
      ...group,
      emojis: group.emojis.filter(
        (item) => !search || item.name.includes(search) || item.emoji === search,
      ),
    }))
    .filter((group) => group.emojis.length);
  return (
    <PanelSheet title="React to message" onClose={onClose}>
      <Input
        accessibilityLabel="Search emoji"
        placeholder="Search emoji"
        value={query}
        onChangeText={setQuery}
      />
      {!groups.length ? (
        <Text className="text-sm text-muted-foreground">No emoji match this search.</Text>
      ) : null}
      {groups.map((group) => (
        <SheetSection key={group.name} title={group.name}>
          <View className="flex-row flex-wrap">
            {group.emojis.map(({ emoji, name }) => (
              <Button
                key={emoji}
                variant="ghost"
                size="icon"
                accessibilityLabel={`${reacted.has(emoji) ? "Remove" : "React with"} ${name}`}
                accessibilityState={{ selected: reacted.has(emoji) }}
                onPress={() => onPick(emoji)}
              >
                <Text className="text-xl">{emoji}</Text>
              </Button>
            ))}
          </View>
        </SheetSection>
      ))}
    </PanelSheet>
  );
}
