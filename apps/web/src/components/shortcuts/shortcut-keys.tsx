import { useFormatForDisplay, type Hotkey } from "@tanstack/react-hotkeys";

import { hotkeySteps, useShortcutLabel } from "@/components/shortcuts/use-shortcut";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "cn";

export function ShortcutKeys({
  hotkey,
  labelled = false,
  className,
}: {
  hotkey: Hotkey;
  labelled?: boolean;
  className?: string;
}) {
  const format = useFormatForDisplay();
  const label = useShortcutLabel();
  return (
    <KbdGroup
      className={cn("shrink-0 whitespace-nowrap", className)}
      aria-hidden={labelled ? undefined : "true"}
      aria-label={labelled ? label(hotkey) : undefined}
    >
      {hotkeySteps(hotkey).map((step, index) => (
        <Kbd key={index}>{format(step)}</Kbd>
      ))}
    </KbdGroup>
  );
}
