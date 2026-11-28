import type { Theme } from "@substrate/contracts/desktop/window-ipc";

type ColorScheme = "light" | "dark";

function storedTheme(storageKey: string): Theme {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === "light" || value === "dark") return value;
  } catch {}
  return "system";
}

export function createThemeStore(storageKey: string) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const systemTheme = (): ColorScheme => (media.matches ? "dark" : "light");
  let snapshot = { theme: storedTheme(storageKey), systemTheme: systemTheme() };
  const listeners = new Set<() => void>();

  function update(theme: Theme) {
    const system = systemTheme();
    if (snapshot.theme === theme && snapshot.systemTheme === system) return;
    snapshot = { theme, systemTheme: system };
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => snapshot,
    // oxlint-disable-next-line deslop/prefer-literal-union -- This boundary validates string values supplied by UI controls.
    setTheme: (theme: string) => {
      if (theme !== "light" && theme !== "dark" && theme !== "system") return;
      try {
        localStorage.setItem(storageKey, theme);
      } catch {}
      update(theme);
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      const onMediaChange = () => update(snapshot.theme);
      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey || event.key === null) update(storedTheme(storageKey));
      };
      media.addEventListener("change", onMediaChange);
      window.addEventListener("storage", onStorage);
      onMediaChange();
      return () => {
        listeners.delete(listener);
        media.removeEventListener("change", onMediaChange);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

export function applyTheme(theme: ColorScheme) {
  const root = document.documentElement;
  if (root.classList.contains(theme) && root.style.colorScheme === theme) return;
  const transitions = document.createElement("style");
  transitions.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.append(transitions);
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
  // Flush the theme change while transitions are disabled.
  void window.getComputedStyle(document.body).opacity;
  window.setTimeout(() => transitions.remove(), 1);
}
