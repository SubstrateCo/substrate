import { defaultShortcuts, type ShortcutId } from "@substrate/contracts/desktop/shortcuts";

import { defineAppHotkeys, type AppHotkey } from "@tanstack/react-hotkeys";

const shortcut = <const Id extends ShortcutId>(id: Id, name: string) => ({
  hotkey: defaultShortcuts[id],
  meta: { name },
});

export const appHotkeys = defineAppHotkeys({
  "app.messages": shortcut("app.messages", "Go to Messages"),
  "app.tasks": shortcut("app.tasks", "Go to Tasks"),
  "app.inbox": shortcut("app.inbox", "Go to Inbox"),
  "app.crm": shortcut("app.crm", "Go to CRM"),

  "app.interactions": shortcut("app.interactions", "Go to Interactions"),
  "app.calendar": shortcut("app.calendar", "Go to Calendar"),
  "app.agents": shortcut("app.agents", "Go to Agents"),
  "app.notifications": shortcut("app.notifications", "Go to Notifications"),
  "search.open": shortcut("search.open", "Search workspace"),
});
appHotkeys satisfies Record<ShortcutId, AppHotkey>;

declare module "@tanstack/react-hotkeys" {
  interface Register {
    appHotkeys: typeof appHotkeys;
  }
}
