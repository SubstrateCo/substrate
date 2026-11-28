import type { Rectangle } from "electron";

const overlayWidth = 404;

export function overlayBounds(workArea: Rectangle): Rectangle {
  const width = Math.min(overlayWidth, workArea.width);
  return {
    x: workArea.x + workArea.width - width,
    y: workArea.y,
    width,
    height: workArea.height,
  };
}
