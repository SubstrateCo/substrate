// Saved pane widths, in pixels, keyed by layout and pane.
// Widths are a device preference, not workspace data, so they stay in localStorage.

const key = (layoutId: string, pane: string) => `substrate:page-layout:${layoutId}:${pane}`;

export function readPaneWidth(layoutId: string, pane: string) {
  try {
    const width = Number(localStorage.getItem(key(layoutId, pane)));
    return Number.isFinite(width) && width > 0 ? width : undefined;
  } catch {
    return undefined;
  }
}

export function writePaneWidth(layoutId: string, pane: string, width: number) {
  try {
    localStorage.setItem(key(layoutId, pane), String(Math.round(width)));
  } catch {
    // Storage can be full or blocked. The layout still works with default widths.
  }
}
