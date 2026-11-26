import { ActivityIndicator, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ArrowRight, Building2, Mail } from "lucide-react-native";

export function WorkspaceRow({
  name,
  detail,
  invitation = false,
  busy,
  disabled,
  onPress,
}: {
  name: string;
  detail?: string;
  invitation?: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const RowIcon = invitation ? Mail : Building2;
  return (
    <Button
      variant="outline"
      className="h-auto min-h-20 flex-row justify-start gap-3 rounded-xl px-4 py-4"
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={`${invitation ? "Accept invitation to" : "Open"} ${name}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Icon as={RowIcon} size={20} className="text-primary" strokeWidth={1.7} />
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-medium" numberOfLines={2}>
          {name}
        </Text>
        {detail ? (
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" />
      ) : (
        <Icon as={ArrowRight} size={18} className="text-muted-foreground" />
      )}
    </Button>
  );
}
