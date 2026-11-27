import { z } from "zod";

/**
 * The shortcuts a person can change, with the app's defaults. Keys use TanStack Hotkeys syntax:
 * a chord such as `Mod+K`, or a sequence of chords such as `["G", "H"]`.
 */
export const defaultShortcuts = {
  "app.messages": ["G", "M"],
  "app.tasks": ["G", "T"],
  "app.inbox": ["G", "E"],
  "app.crm": ["G", "C"],

  "app.interactions": ["G", "I"],
  "app.calendar": ["G", "L"],
  "app.agents": ["G", "A"],
  "app.notifications": ["G", "N"],
  "search.open": "Mod+K",
} as const;

export type ShortcutId = keyof typeof defaultShortcuts;
// SAFETY: the keys of a literal object are exactly its declared keys.
export const shortcutIds = Object.keys(defaultShortcuts) as [ShortcutId, ...ShortcutId[]];

const chord = z.string().min(1).max(64).regex(/^\S+$/u);
/** One shortcut: a chord, or a sequence of up to four chords. */
export const shortcut = z.union([chord, z.array(chord).min(1).max(4).readonly()]);
export type Shortcut = z.infer<typeof shortcut>;

/** Every configurable shortcut. A record with an enum key requires each ID. */
export const shortcutSettings = z.record(z.enum(shortcutIds), shortcut);
export type ShortcutSettings = z.infer<typeof shortcutSettings>;

const savedShortcut = shortcut.optional().catch(undefined);
/** Shortcuts as read from a file a person can edit. An invalid entry reads as missing. */
export const savedShortcuts = z
  .object(
    // SAFETY: the entries hold one schema for each shortcut ID.
    Object.fromEntries(shortcutIds.map((id) => [id, savedShortcut])) as Record<
      ShortcutId,
      typeof savedShortcut
    >,
  )
  .catch({});
export type SavedShortcuts = z.infer<typeof savedShortcuts>;

/**
 * Gives each missing shortcut its default, so one bad entry keeps the others. `filled` is true
 * when any default was used.
 */
export function fillShortcuts(saved: SavedShortcuts) {
  // SAFETY: the loop below sets every shortcut ID.
  const shortcuts = {} as ShortcutSettings;
  for (const id of shortcutIds) shortcuts[id] = saved[id] ?? defaultShortcuts[id];
  return { shortcuts, filled: shortcutIds.some((id) => saved[id] === undefined) };
}
