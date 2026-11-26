import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SwitchField } from "@/features/records/ui/fields";
import { Globe } from "lucide-react-native";

/**
 * Explains what happens to people outside the workspace and asks whether they may read earlier
 * messages. Show it only when someone will get an invitation.
 */
export function ShareHistoryField({
  summary,
  checked,
  disabled,
  onChange,
}: {
  summary: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <View className="gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <View className="flex-row gap-2">
        <Icon as={Globe} className="mt-0.5 size-4 text-muted-foreground" />
        <Text className="flex-1 text-sm">{summary}</Text>
      </View>
      <SwitchField
        label="Let invited people read the full conversation history"
        checked={checked}
        onChange={(value) => !disabled && onChange(value)}
      />
    </View>
  );
}
