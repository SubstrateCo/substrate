import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, Pressable } from "react-native";

import { cn } from "@/lib/utils";

const longPressDelay = 350;

export function MessagePressable({
  onLongPress,
  className,
  testID,
  children,
}: {
  onLongPress?: () => void;
  className?: string;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessible={false}
      onLongPress={onLongPress}
      delayLongPress={longPressDelay}
      testID={testID}
      className={cn(
        "group/message",
        onLongPress && "active:bg-muted/60",
        Platform.select({ web: "hover:bg-muted/40" }),
        className,
      )}
    >
      {children}
    </Pressable>
  );
}

export function useScreenReaderEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => active && setEnabled(value));
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setEnabled);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}
