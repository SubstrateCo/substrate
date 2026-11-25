import type { ContextAction } from "@/components/layout/action-context-menu";
import { Copy, Download, Maximize2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Copies an image file to the clipboard. Chromium's clipboard takes only PNG, so other formats
 * are redrawn as PNG; an animated GIF copies its first frame.
 */
async function copyImage(url: string, contentType: string) {
  // A promised item keeps the click's user activation while the file downloads.
  const png = (async () => {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error("Couldn't load the image");
    const blob = new Blob([await response.blob()], { type: contentType });
    if (contentType === "image/png") return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.convertToBlob({ type: "image/png" });
  })();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/** Saves a same-origin file. The desktop app asks where to save it. */
function downloadFile(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

/** Right-click actions for an image file. `onOpen` adds "Open image" for a thumbnail. */
export function imageFileActions({
  href,
  filename,
  contentType,
  onOpen,
}: {
  href: string;
  filename: string;
  contentType: string;
  onOpen?: () => void;
}): ContextAction[] {
  return [
    ...(onOpen ? [{ label: "Open image", icon: Maximize2, onSelect: onOpen }] : []),
    {
      label: "Copy image",
      icon: Copy,
      onSelect: () =>
        void copyImage(href, contentType).then(
          () => toast.success("Image copied"),
          () => toast.error("Couldn’t copy the image. Try downloading it."),
        ),
    },
    { label: "Download image", icon: Download, onSelect: () => downloadFile(href, filename) },
  ];
}
