import type { PickedRecipient, PickerPerson } from "@substrate/contracts/people/picker";

import { useState } from "react";
import { View } from "react-native";

import { PersonAvatar } from "../shared/person-avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import {
  isEmailAddress,
  matchPeople,
  recipientFor,
} from "@/features/messaging/conversations/recipients";
import { X } from "lucide-react-native";

const suggestionLimit = 6;

/** Chosen people as removable chips, a search field, and matching members to add. */
export function RecipientField({
  label,
  people,
  value,
  max,
  disabled,
  error,
  onChange,
}: {
  label: string;
  people: readonly PickerPerson[];
  value: PickedRecipient[];
  max?: number;
  disabled?: boolean;
  error?: string;
  onChange: (value: PickedRecipient[]) => void;
}) {
  const [text, setText] = useState("");
  const full = max !== undefined && value.length >= max;
  const add = (recipient: PickedRecipient) => {
    if (full || value.some((entry) => entry.email === recipient.email)) return;
    onChange([...value, recipient]);
    setText("");
  };
  const typed = recipientFor(text, people);
  const suggestions = full ? [] : matchPeople(people, text, value).slice(0, suggestionLimit);
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      {value.length ? (
        <View className="flex-row flex-wrap gap-1.5">
          {value.map((recipient) => {
            const name = recipient.person?.name ?? recipient.email;
            return (
              <Button
                variant="ghost"
                key={recipient.email}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${name}`}
                disabled={disabled}
                onPress={() => onChange(value.filter((entry) => entry !== recipient))}
                className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-0"
              >
                <Text className="text-sm" numberOfLines={1}>
                  {name}
                </Text>
                {!recipient.person ? (
                  <Text className="text-xs text-muted-foreground">Invite</Text>
                ) : null}
                <Icon as={X} className="size-3.5 text-muted-foreground" />
              </Button>
            );
          })}
        </View>
      ) : null}
      {!full ? (
        <Input
          value={text}
          editable={!disabled}
          onChangeText={(next) => {
            // A separator after a complete address adds it.
            const match = /^(.+?)[\s,;]$/.exec(next);
            const recipient =
              match && isEmailAddress(match[1]!) ? recipientFor(match[1]!, people) : undefined;
            if (recipient) add(recipient);
            else setText(next);
          }}
          onSubmitEditing={() => typed && add(typed)}
          placeholder="Name or email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          accessibilityLabel={label}
          className={error ? "border-destructive" : undefined}
        />
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
      {typed && !typed.person && !value.some((entry) => entry.email === typed.email) ? (
        <Button
          variant="ghost"
          accessibilityRole="button"
          onPress={() => add(typed)}
          className="min-h-12 flex-row items-center justify-start gap-3 rounded-md px-2 py-0 active:bg-accent"
        >
          <Text className="flex-1 text-[15px]" numberOfLines={1}>{`Invite ${typed.email}`}</Text>
        </Button>
      ) : null}
      {suggestions.map((person) => (
        <Button
          variant="ghost"
          key={person.id}
          accessibilityRole="button"
          accessibilityLabel={`Add ${person.name}`}
          disabled={disabled}
          onPress={() => add({ email: person.email.toLowerCase(), person })}
          className="min-h-12 flex-row items-center justify-start gap-3 rounded-md px-2 py-0 active:bg-accent"
        >
          <PersonAvatar name={person.name} image={person.image} size="sm" />
          <View className="min-w-0 flex-1">
            <Text className="text-[15px]" numberOfLines={1}>
              {person.name}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {person.email}
            </Text>
          </View>
        </Button>
      ))}
    </View>
  );
}
