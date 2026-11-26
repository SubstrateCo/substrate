import { useFormatForDisplay, type Hotkey } from "@tanstack/react-hotkeys";

import { hotkeySteps, useShortcutLabel } from "@/components/shortcuts/use-shortcut";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

/**
 * A shortcut's keys, one key cap per step. Without `labelled`, screen readers skip it, so name the
 * keys on the control instead.
 */
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
      className={className}
      aria-hidden={labelled ? undefined : "true"}
      aria-label={labelled ? label(hotkey) : undefined}
    >
      {hotkeySteps(hotkey).map((step, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- A sequence can repeat a step.
        <Kbd key={index}>{format(step)}</Kbd>
      ))}
    </KbdGroup>
  );
}
