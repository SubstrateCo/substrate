import { createAttentionBadge } from "./attention-badge.ts";
import { app, nativeImage, type BrowserWindow } from "electron";

export function createNativeAttentionBadge(
  getWindow: () => BrowserWindow | undefined,
  atlasPath: string,
) {
  const atlas = process.platform === "win32" ? nativeImage.createFromPath(atlasPath) : undefined;
  return createAttentionBadge((label, description) => {
    if (process.platform === "darwin") {
      app.dock?.setBadge(label);
      return;
    }
    if (process.platform === "linux") {
      app.setBadgeCount(label === "99+" ? 100 : Number(label));
      return;
    }
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    if (!label) {
      window.setOverlayIcon(null, "");
      return;
    }
    if (!atlas || atlas.isEmpty()) throw new Error("Attention badge artwork is missing.");
    const index = label === "99+" ? 99 : Number(label) - 1;
    const frame = atlas.crop({
      x: (index % 10) * 64,
      y: Math.floor(index / 10) * 64,
      width: 64,
      height: 64,
    });
    const image = frame.resize({ width: 16, height: 16, quality: "best" });
    image.addRepresentation({
      scaleFactor: 2,
      buffer: frame.resize({ width: 32, height: 32, quality: "best" }).toPNG(),
    });
    window.setOverlayIcon(image, description);
  });
}
