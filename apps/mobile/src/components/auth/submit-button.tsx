import { ActivityIndicator } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function SubmitButton({
  busy,
  disabled,
  label,
  onPress,
}: {
  busy: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button disabled={busy || disabled} onPress={onPress} className="min-h-12 flex-row gap-2">
      {busy ? <ActivityIndicator size="small" /> : null}
      <Text>{busy ? "Please wait…" : label}</Text>
    </Button>
  );
}
