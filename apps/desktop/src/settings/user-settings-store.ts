import {
  fillShortcuts,
  savedShortcuts,
  shortcutSettings,
  type ShortcutSettings,
} from "@substrate/contracts/desktop/shortcuts";

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

const settingsFile = z.looseObject({ shortcuts: savedShortcuts });

function read(path: string) {
  if (!existsSync(path)) return settingsFile.parse({});
  try {
    return settingsFile.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

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
