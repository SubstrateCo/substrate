import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { AlertCircle, CheckCircle2 } from "lucide-react-native";

export function AuthNotice({ message, success = false }: { message?: string; success?: boolean }) {
  if (!message) return null;
  const NoticeIcon = success ? CheckCircle2 : AlertCircle;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={`flex-row items-start gap-3 rounded-xl border p-4 ${success ? "border-border bg-muted" : "border-destructive/30 bg-destructive/5"}`}
    >
      <Icon as={NoticeIcon} size={18} className={success ? "text-primary" : "text-destructive"} />
      <Text
        className={`flex-1 text-sm leading-5 ${success ? "text-foreground" : "text-destructive"}`}
      >
        {message}
      </Text>
    </View>
  );
}
