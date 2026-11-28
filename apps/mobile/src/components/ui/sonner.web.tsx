import { useEffect, useState, type CSSProperties } from "react";

import { useToastOffset } from "@/lib/notifications/use-toast-offset";
import { mountToasts } from "@/lib/toast";
import geistWeights from "@/theme/geist-weights.json";
import { useTheme } from "@/theme/provider";
import { CircleCheck, Info, OctagonX, TriangleAlert } from "lucide-react-native";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  const { colorScheme, colors, metrics } = useTheme();
  const offset = useToastOffset();
  const unit = metrics.spacing.unit;
  const [touchExpanded, setTouchExpanded] = useState(false);
  const style: CSSProperties & Record<`--${string}`, string> = {
    fontFamily: geistWeights.normal,
    "--normal-bg": colors.popover,
    "--normal-text": colors["popover-foreground"],
    "--normal-border": colors.border,
    "--border-radius": `${metrics.radius.lg}px`,
  };
  useEffect(mountToasts, []);

  return (
    <div
      style={{ display: "contents" }}
      onPointerDownCapture={(event) => {
        if (event.pointerType !== "touch" || !(event.target instanceof Element)) return;
        if (event.target.closest("button")) return;
        // Suppress compatibility mouse events, which otherwise leave hover open
        // after a touch ends. Sonner still receives the pointer gesture itself.
        event.preventDefault();
        setTouchExpanded(true);
      }}
      onPointerUpCapture={() => setTouchExpanded(false)}
      onPointerCancelCapture={() => setTouchExpanded(false)}
    >
      <Sonner
        theme={colorScheme}
        position="bottom-center"
        expand={touchExpanded}
        containerAriaLabel="Notifications. Hold to expand the stack; release to collapse."
        visibleToasts={3}
        richColors={false}
        closeButton
        duration={4500}
        gap={unit * 2}
        offset={{ bottom: offset, left: unit * 4, right: unit * 4 }}
        mobileOffset={{ bottom: offset, left: unit * 4, right: unit * 4 }}
        icons={{
          success: <CircleCheck size={unit * 4} color={colors.success} />,
          info: <Info size={unit * 4} color={colors["accent-foreground"]} />,
          warning: <TriangleAlert size={unit * 4} color={colors["accent-foreground"]} />,
          error: <OctagonX size={unit * 4} color={colors.destructive} />,
        }}
        style={style}
        toastOptions={{
          unstyled: true,
          closeButtonAriaLabel: "Dismiss notification",
          classNames: {
            toast:
              "flex w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-popover py-4 pl-4 pr-14 text-popover-foreground",
            content: "flex min-w-0 flex-1 flex-col gap-0.5",
            title: "font-medium",
            description: "text-muted-foreground",
            icon: "flex size-4 shrink-0 items-center justify-center",
            actionButton:
              "mt-2 min-h-12 min-w-12 whitespace-normal break-words rounded-md border border-border bg-popover px-3 font-medium text-popover-foreground",
            closeButton:
              "!absolute !top-1/2 !right-0 !left-auto !size-12 !translate-x-0 !-translate-y-1/2 !rounded-md !border-0 !bg-transparent !text-muted-foreground !shadow-none",
          },
          style: {
            boxShadow: metrics.elevation[colorScheme].floating,
            fontSize: metrics.typography.roles.sm.fontSize,
            lineHeight: `${metrics.typography.roles.sm.lineHeight}px`,
          },
        }}
      />
    </div>
  );
}
