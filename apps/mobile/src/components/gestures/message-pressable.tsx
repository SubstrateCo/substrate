import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, Pressable } from "react-native";

import { cn } from "@/lib/utils";

const longPressDelay = 350;

/**
 * A message row that opens its actions on long press, like a chat app. The row is not an
 * accessibility element itself, so the links, chips and buttons inside it stay reachable; screen
 * reader and keyboard users open the same actions from the row's More button. On the web the row
 * is a hover group, so that button can appear on hover or focus.
 */
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

/** Whether a screen reader is running, kept current while it turns on or off. */
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
