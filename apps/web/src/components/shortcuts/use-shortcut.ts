import type { ShortcutId } from "@substrate/contracts/desktop/shortcuts";

import {
  detectPlatform,
  isHotkeySequence,
  useAppHotkeys,
  useFormatForDisplay,
  type Hotkey,
} from "@tanstack/react-hotkeys";

export const hotkeySteps = (hotkey: Hotkey) => (isHotkeySequence(hotkey) ? hotkey : [hotkey]);

export function useShortcut(id: ShortcutId): Hotkey | null {
  return useAppHotkeys()[id].hotkey;
}

export function useShortcutLabel() {
  const format = useFormatForDisplay();
  return (hotkey: Hotkey) =>
    hotkeySteps(hotkey)
      .map((step) => format(step))
      .join(" then ");
}

export function ariaKeyShortcuts(hotkey: Hotkey) {
  const mod = detectPlatform() === "mac" ? "Meta" : "Control";
  return hotkeySteps(hotkey)
    .map((step) => step.replace(/\bMod\b/u, mod))
    .join(" ");
}
