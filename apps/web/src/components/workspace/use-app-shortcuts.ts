import { useEffect, useEffectEvent, useRef } from "react";

/** Keys pressed after G, Linear style: G then M opens Messages. */
export const appShortcutKeys = {
  messages: "M",
  tasks: "T",
  crm: "C",
  agents: "A",
  notifications: "N",
} as const;

const apps = ["messages", "tasks", "crm", "agents", "notifications"] as const;
export type ShortcutApp = (typeof apps)[number];

const sequenceMs = 1000;

// Text fields keep their keys, and open dialogs and menus own the keyboard.
function busy(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest(
    "input, textarea, select, [contenteditable=''], [contenteditable=true], [role=dialog], [role=alertdialog], [role=menu], [role=listbox]",
  );
}

/** Listens for G then an app key outside text fields and calls `onOpen` with the app. */
export function useAppShortcuts(onOpen: (app: ShortcutApp) => void) {
  const pressed = useRef(0);
  const open = useEffectEvent(onOpen);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || busy(event.target)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key.toUpperCase();
      if (key === "G") {
        pressed.current = event.timeStamp;
        return;
      }
      const started = pressed.current;
      pressed.current = 0;
      if (!started || event.timeStamp - started > sequenceMs) return;
      const app = apps.find((name) => appShortcutKeys[name] === key);
      if (!app) return;
      event.preventDefault();
      open(app);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
}
