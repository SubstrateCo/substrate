import { useEffect } from "react";
import { useWindowDimensions } from "react-native";

import { useToastOffset } from "@/lib/notifications/use-toast-offset";
import { mountToasts } from "@/lib/toast";
import geistWeights from "@/theme/geist-weights.json";
import { useTheme } from "@/theme/provider";
import { CircleCheck, Info, OctagonX, TriangleAlert } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Toaster as Sonner } from "sonner-native";

/** Tap the collapsed stack to expand upward; tap again or outside to collapse. */
export function Toaster() {
  const { colorScheme, colors, metrics } = useTheme();
  const offset = useToastOffset();
  const unit = metrics.spacing.unit;
  const type = metrics.typography.roles.sm;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableWidth = width - insets.left - insets.right;
  const toastWidth = Math.min(availableWidth, unit * 100);
  useEffect(mountToasts, []);

  return (
    <Sonner
      theme={colorScheme}
      position="bottom-center"
      offset={offset}
      positionerStyle={{
        width: toastWidth,
        left: insets.left + (availableWidth - toastWidth) / 2,
      }}
      visibleToasts={3}
      enableStacking
      autoWiggleOnUpdate="never"
      richColors={false}
      closeButton
      allowFontScaling
      duration={4500}
      gap={unit * 2}
      icons={{
        success: <CircleCheck size={unit * 4} color={colors.success} />,
        info: <Info size={unit * 4} color={colors["accent-foreground"]} />,
        warning: <TriangleAlert size={unit * 4} color={colors["accent-foreground"]} />,
        error: <OctagonX size={unit * 4} color={colors.destructive} />,
      }}
      toastOptions={{
        unstyled: true,
        style: {
          backgroundColor: colors.popover,
          boxShadow: metrics.elevation[colorScheme].floating,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: metrics.radius.lg,
          marginHorizontal: unit * 4,
          paddingLeft: unit * 4,
          paddingRight: unit * 2,
          paddingVertical: unit * 2,
          minHeight: unit * 16,
        },
        toastContentStyle: {
          flexDirection: "row",
          alignItems: "center",
          gap: unit * 2,
        },
        textContainerStyle: { minWidth: 0, gap: unit / 2 },
        titleStyle: {
          ...type,
          fontFamily: geistWeights.medium,
          color: colors["popover-foreground"],
        },
        descriptionStyle: {
          ...type,
          fontFamily: geistWeights.normal,
          color: colors["muted-foreground"],
        },
        buttonsStyle: { flexDirection: "row", flexWrap: "wrap", gap: unit * 2 },
      }}
    />
  );
}
