import { Platform, Pressable } from "react-native";

import Animated from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function NativeOnlyAnimatedView(
  props:
    | (React.ComponentProps<typeof Animated.View> &
        React.RefAttributes<typeof Animated.View> & { as?: "View" })
    | (React.ComponentProps<typeof AnimatedPressable> &
        React.RefAttributes<typeof AnimatedPressable> & { as: "Pressable" }),
) {
  if (Platform.OS === "web") {
    // SAFETY: Callers pass static React children; this wrapper bypasses native animation props on web.
    return <>{props.children as React.ReactNode}</>;
  } else {
    if (props.as === "Pressable") {
      return <AnimatedPressable {...props} />;
    }
    return <Animated.View {...props} />;
  }
}

export { NativeOnlyAnimatedView };
