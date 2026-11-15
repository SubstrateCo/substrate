import { defineAppHotkeys } from "@tanstack/react-hotkeys";

/**
 * Every app shortcut, declared once so the app can list and check them before their components
 * mount. Ids are stable: saved custom shortcuts will be keyed by them. Callbacks stay in the
 * components that own the action.
 */
export const appHotkeys = defineAppHotkeys({
  "app.messages": { hotkey: ["G", "M"], meta: { name: "Open Messages", group: "Apps" } },
  "app.tasks": { hotkey: ["G", "T"], meta: { name: "Open Tasks", group: "Apps" } },
  "app.crm": { hotkey: ["G", "C"], meta: { name: "Open CRM", group: "Apps" } },
  "app.agents": { hotkey: ["G", "A"], meta: { name: "Open Agents", group: "Apps" } },
  "app.contacts": { hotkey: ["G", "P"], meta: { name: "Open Contacts", group: "Apps" } },
  "app.notifications": {
    hotkey: ["G", "N"],
    meta: { name: "Open Notifications", group: "Apps" },
  },
  "search.open": { hotkey: "Mod+K", meta: { name: "Search workspace", group: "Search" } },
  "search.nextType": {
    hotkey: "Control+Tab",
    meta: { name: "Next search type", group: "Search" },
  },
  "search.previousType": {
    hotkey: "Control+Shift+Tab",
    meta: { name: "Previous search type", group: "Search" },
  },
});

declare module "@tanstack/react-hotkeys" {
  interface Register {
    appHotkeys: typeof appHotkeys;
  }
}
