import { defaultShortcuts, type ShortcutId } from "@substrate/contracts/desktop/shortcuts";

import { defineAppHotkeys, type AppHotkey } from "@tanstack/react-hotkeys";

const shortcut = <const Id extends ShortcutId>(id: Id, name: string) => ({
  hotkey: defaultShortcuts[id],
  meta: { name },
});

/**
 * Every shortcut a person can change, in settings order. `ShortcutsProvider` applies their saved
 * keys, so code that registers one of these gets the person's keys, not the defaults.
 */
export const appHotkeys = defineAppHotkeys({
  "app.home": shortcut("app.home", "Go to Home"),
  "app.messages": shortcut("app.messages", "Go to Messages"),
  "app.tasks": shortcut("app.tasks", "Go to Tasks"),
  "app.inbox": shortcut("app.inbox", "Go to Inbox"),
  "app.crm": shortcut("app.crm", "Go to CRM"),
  "app.meetings": shortcut("app.meetings", "Go to Meetings"),
  "app.interactions": shortcut("app.interactions", "Go to Interactions"),
  "app.calendar": shortcut("app.calendar", "Go to Calendar"),
  "app.agents": shortcut("app.agents", "Go to Agents"),
  "app.notifications": shortcut("app.notifications", "Go to Notifications"),
  "search.open": shortcut("search.open", "Search workspace"),
});
// Every contract shortcut needs a declaration here.
appHotkeys satisfies Record<ShortcutId, AppHotkey>;

declare module "@tanstack/react-hotkeys" {
  interface Register {
    appHotkeys: typeof appHotkeys;
  }
}
