import { useId, useState } from "react";
import { View, type TextInputProps } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react-native";

export function AuthField({
  label,
  password = false,
  ...props
}: TextInputProps & { label: string; password?: boolean }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const VisibilityIcon = visible ? EyeOff : Eye;
  return (
    <View className="gap-2">
      <Label nativeID={id}>{label}</Label>
      <View className="relative">
        <Input
          {...props}
          aria-labelledby={id}
          accessibilityLabel={label}
          className={password ? "pr-14" : undefined}
          secureTextEntry={password && !visible}
        />
        {password ? (
          <Button
            variant="ghost"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            onPress={() => setVisible(!visible)}
            className="absolute right-0 top-0 h-full min-h-11 w-12 items-center justify-center"
            hitSlop={4}
          >
            <Icon as={VisibilityIcon} size={18} className="text-muted-foreground" />
          </Button>
        ) : null}
      </View>
    </View>
  );
}
