import {
  fillShortcuts,
  savedShortcuts,
  shortcutSettings,
  type ShortcutSettings,
} from "@substrate/contracts/desktop/shortcuts";

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

// Loose, so keys that this store does not own survive a write.
const settingsFile = z.looseObject({ shortcuts: savedShortcuts });

/** The file's settings, or undefined when the file exists but is not a JSON object. */
function read(path: string) {
  if (!existsSync(path)) return settingsFile.parse({});
  try {
    return settingsFile.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

/**
 * The person's settings for this device in one JSON file that they can also edit by hand. The
 * store reads it once at launch and writes the app defaults for any shortcut that is missing or
 * invalid. A file that is not a JSON object is left alone until the person saves a change, so a
 * broken hand edit is not lost. Writes keep keys this store does not own and replace the file
 * atomically.
 */
export function createUserSettingsStore(path: string) {
  let file = read(path);
  const loaded = fillShortcuts(file?.shortcuts ?? {});
  let shortcuts = loaded.shortcuts;

  function write() {
    file = { ...file, shortcuts };
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
  }

  if (file && loaded.filled) write();
  return {
    shortcuts: (): ShortcutSettings => shortcuts,
    setShortcuts(value: ShortcutSettings) {
      shortcuts = shortcutSettings.parse(value);
      write();
      return shortcuts;
    },
  };
}
