import type { ShortcutId } from "@substrate/contracts/desktop/shortcuts";

import {
  detectPlatform,
  isHotkeySequence,
  useAppHotkeys,
  useFormatForDisplay,
  type Hotkey,
} from "@tanstack/react-hotkeys";

/** A shortcut's steps: one for a chord, several for a sequence. */
export const hotkeySteps = (hotkey: Hotkey) => (isHotkeySequence(hotkey) ? hotkey : [hotkey]);

/**
 * The person's current keys for a shortcut, from `ShortcutsProvider`. Read keys for display
 * through this hook, never from the defaults, so every hint follows a change at once.
 */
export function useShortcut(id: ShortcutId): Hotkey | null {
  return useAppHotkeys()[id].hotkey;
}

/** A shortcut as words for an accessible name, such as "Ctrl+K" or "G then H". */
export function useShortcutLabel() {
  const format = useFormatForDisplay();
  return (hotkey: Hotkey) =>
    hotkeySteps(hotkey)
      .map((step) => format(step))
      .join(" then ");
}

/** A shortcut in `aria-keyshortcuts` syntax, with `Mod` named for this platform. */
export function ariaKeyShortcuts(hotkey: Hotkey) {
  const mod = detectPlatform() === "mac" ? "Meta" : "Control";
  return hotkeySteps(hotkey)
    .map((step) => step.replace(/\bMod\b/u, mod))
    .join(" ");
}
