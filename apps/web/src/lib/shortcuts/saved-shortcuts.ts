import {
  defaultShortcuts,
  shortcutIds,
  type Shortcut,
  type ShortcutSettings,
} from "@substrate/contracts/desktop/shortcuts";

import type { CustomHotkeys, Hotkey } from "@tanstack/react-hotkeys";

const same = (left: Shortcut, right: Shortcut) => JSON.stringify(left) === JSON.stringify(right);

export function customFromSaved(saved: ShortcutSettings): CustomHotkeys {
  const custom: CustomHotkeys = {};
  for (const id of shortcutIds) {
    if (same(saved[id], defaultShortcuts[id])) continue;
    // SAFETY: the provider ignores entries that are not valid hotkeys.
    custom[id] = saved[id] as Hotkey;
  }
  return custom;
}

export function savedFromCustom(custom: CustomHotkeys): ShortcutSettings {
  // SAFETY: the loop below sets every shortcut ID.
  const saved = {} as ShortcutSettings;
  for (const id of shortcutIds) saved[id] = custom[id] ?? defaultShortcuts[id];
  return saved;
}
