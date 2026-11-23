import type { Rectangle } from "electron";

/** The overlay insets cards by 24 px, so this width gives the 356 px in-app toast width. */
export const overlayWidth = 404;

/** A full-height column at the top right of the display's work area. */
export function overlayBounds(workArea: Rectangle): Rectangle {
  const width = Math.min(overlayWidth, workArea.width);
  return {
    x: workArea.x + workArea.width - width,
    y: workArea.y,
    width,
    height: workArea.height,
  };
}
