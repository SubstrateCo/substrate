import { metrics } from "@substrate/design-tokens";

import { useEffect, useState } from "react";
import { Keyboard, useWindowDimensions } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Leave the bottom navigation/composer clear, including above the keyboard. */
export function useToastOffset() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [keyboardTop, setKeyboardTop] = useState(() => Keyboard.metrics()?.screenY ?? null);

  useEffect(() => {
    const update = (event: { endCoordinates: { screenY: number } }) =>
      setKeyboardTop(event.endCoordinates.screenY);
    const change = Keyboard.addListener("keyboardDidChangeFrame", update);
    const show = Keyboard.addListener("keyboardDidShow", update);
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardTop(null));
    return () => {
      change.remove();
      show.remove();
      hide.remove();
    };
  }, []);

  // Android's resized window already excludes the keyboard; do not count it twice.
  const keyboardHeight = keyboardTop === null ? 0 : Math.max(0, height - keyboardTop);
  return metrics.spacing.unit * 20 + Math.max(insets.bottom, keyboardHeight);
}
