import { metrics } from "@substrate/design-tokens";

import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  useWindowDimensions,
  View,
} from "react-native";

import { useTheme } from "@/theme/provider";
import * as DialogPrimitive from "@rn-primitives/dialog";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type NavigationSurfaceProps = {
  side: "left" | "right";
  fullScreen?: boolean;
  title?: string;
  onClose: () => void;
  children: (close: (afterClose?: () => void) => void) => React.ReactNode;
};

export function NavigationSurface({
  side,
  fullScreen = false,
  title,
  onClose,
  children,
}: NavigationSurfaceProps) {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const [closing, setClosing] = useState(false);
  let panelWidth = width;
  if (!fullScreen) panelWidth = side === "left" ? width * 0.83 : width - metrics.spacing.unit * 4;
  const direction = side === "left" ? -1 : 1;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active) return;
      Animated.timing(progress, {
        toValue: 1,
        duration: reduced ? 0 : 260,
        easing: Easing.bezier(...metrics.motion.easing.drawer),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      active = false;
      progress.stopAnimation();
    };
  }, [progress]);

  function dismiss(afterClose?: () => void) {
    if (closing) return;
    setClosing(true);
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      Animated.timing(progress, {
        toValue: 0,
        duration: reduced ? 0 : 200,
        easing: Easing.bezier(...metrics.motion.easing.drawer),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onClose();
          afterClose?.();
        }
      });
    });
  }

  const dismissGesture = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => {
      const horizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2;
      const edge = side === "left" || gesture.x0 <= width - panelWidth + 24;
      return gesture.dx * direction > 12 && horizontal && edge;
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx * direction > 64) dismiss();
    },
  });

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogPrimitive.Portal>
        <View className="absolute inset-0 z-50 web:fixed" accessibilityViewIsModal>
          <Animated.View
            className="absolute inset-0 bg-overlay"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: colors.overlay,
              opacity: progress,
            }}
            pointerEvents="none"
          />
          <DialogPrimitive.Overlay
            className="absolute inset-0"
            accessibilityLabel="Close panel"
            testID="panel-backdrop"
          />
          <Animated.View
            {...dismissGesture.panHandlers}
            testID={side === "left" ? "conversation-drawer" : "record-panel"}
            className="absolute bottom-0 top-0 overflow-hidden border-border bg-surface"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: panelWidth,
              [side]: 0,
              backgroundColor: colors.surface,
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [direction * panelWidth, 0],
                  }),
                },
              ],
            }}
          >
            <DialogPrimitive.Content
              aria-describedby={undefined}
              style={{
                width: panelWidth,
                height,
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
                backgroundColor: colors.surface,
              }}
            >
              <DialogPrimitive.Title className="sr-only">
                {title ?? (side === "left" ? "Channels and direct messages" : "Record details")}
              </DialogPrimitive.Title>
              <View className="flex-1">{children(dismiss)}</View>
            </DialogPrimitive.Content>
          </Animated.View>
        </View>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
