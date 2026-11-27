import type { HistoryLocation, RouterHistory } from "@tanstack/react-router";

type ReturnDelta = (href: string, keys: readonly string[]) => number | undefined;
const returns = new WeakMap<RouterHistory, ReturnDelta>();

function address(href: string, omit: readonly string[] = []) {
  const url = new URL(href, "https://workspace.invalid");
  for (const key of omit) url.searchParams.delete(key);
  url.searchParams.sort();
  return `${url.pathname}${url.search}${url.hash}`;
}

const workspace = (href: string) =>
  new URL(href, "https://workspace.invalid").searchParams.get("workspaceId");

/**
 * Only entries observed in this document can prove a safe return. Reloads deliberately start
 * fresh. The router remains the history owner; this records committed entries, not a second stack.
 */
export function trackPanelHistory(history: RouterHistory) {
  const entries = new Map<number, HistoryLocation>();
  let scope = workspace(history.location.href);
  const remember = (location: HistoryLocation) => entries.set(location.state.__TSR_index, location);
  remember(history.location);
  history.subscribe(({ location, action }) => {
    const nextScope = workspace(location.href);
    const index = location.state.__TSR_index;
    if (nextScope !== scope) entries.clear();
    scope = nextScope;
    if (action.type === "PUSH") {
      for (const position of entries.keys()) if (position >= index) entries.delete(position);
    } else if (
      action.type !== "REPLACE" &&
      entries.has(index) &&
      entries.get(index)?.state.__TSR_key !== location.state.__TSR_key
    )
      entries.clear();
    // Browser history flushes in a microtask. A second navigation in the same event can replace
    // the queued destination; do not treat its superseded intermediate entry as an opener.
    queueMicrotask(() => {
      const current = history.location;
      if (current.state.__TSR_key === location.state.__TSR_key && current.href === location.href)
        remember(location);
    });
  });
  returns.set(history, (href, keys) => {
    const current = history.location;
    const index = current.state.__TSR_index;
    const target = address(href);
    const background = address(href, keys);
    const sameWorkspace = scope && scope === workspace(href);
    const currentKey = current.state.__TSR_key;
    const knownEntry = !!currentKey && entries.get(index)?.state.__TSR_key === currentKey;
    if (!sameWorkspace || !knownEntry || address(current.href, keys) !== background) return;
    // Stop at a gap, another app, or any changed background state. Never skip unrelated visits.
    for (let position = index - 1; position >= 0; position--) {
      const entry = entries.get(position);
      if (!entry || address(entry.href, keys) !== background) return;
      if (address(entry.href) === target) return position - index;
    }
  });
}

export function panelReturnDelta(history: RouterHistory, href: string, keys: readonly string[]) {
  return returns.get(history)?.(href, keys);
}
