import { useEffect, useRef, useState } from "react";

import { cropImage, type CropArea } from "@/components/upload/crop-image";
import type { ImageCropDialogProps } from "@/components/upload/image-crop-dialog";

/**
 * Crops the picture, then hands the PNG to the caller's upload mutation. Both steps share one
 * abort signal, so Cancel upload stops either one until the upload commits.
 */
export function usePictureUpload({
  file,
  area,
  rotation,
  mode,
  uploading,
  uploadError,
  onUpload,
}: Pick<ImageCropDialogProps, "file" | "uploading" | "uploadError" | "onUpload"> & {
  area: CropArea | null;
  rotation: number;
  mode: "fit" | "fill";
}) {
  const [committing, setCommitting] = useState(false);
  const [crop, setCrop] = useState<
    { status: "idle" | "cropping" } | { status: "failed" | "handed-off"; signal: AbortSignal }
  >({ status: "idle" });
  // The dialog closes without asking while an upload runs only when its page goes away.
  const attempt = useRef<{
    controller: AbortController;
    cropping: boolean;
    committed: boolean;
  } | null>(null);
  useEffect(
    () => () => {
      if (!attempt.current?.committed) attempt.current?.controller.abort();
      attempt.current = null;
    },
    [],
  );
  const pending = crop.status === "cropping" || uploading;
  // An upload error belongs to this dialog only after its crop was handed off.
  let error: string | null = null;
  if (crop.status === "failed" || (crop.status === "handed-off" && uploadError))
    error = crop.signal.aborted
      ? "Upload cancelled. Your crop is still here."
      : "We couldn’t save this picture. Your crop is still here. Please try again.";
  async function confirm() {
    if (pending || attempt.current?.cropping) return;
    const controller = new AbortController();
    const current = { controller, cropping: true, committed: false };
    attempt.current = current;
    const { signal } = controller;
    setCommitting(false);
    setCrop({ status: "cropping" });
    try {
      const blob = await cropImage(file, area, rotation, mode, signal);
      if (attempt.current !== current) return;
      signal.throwIfAborted();
      onUpload(blob, {
        signal,
        onCommit: () => {
          current.committed = true;
          if (attempt.current === current) setCommitting(true);
        },
      });
      setCrop({ status: "handed-off", signal });
    } catch {
      if (attempt.current === current) setCrop({ status: "failed", signal });
    }
    current.cropping = false;
  }
  function cancelUpload() {
    if (!attempt.current?.committed) attempt.current?.controller.abort();
  }
  return {
    error,
    clearError: () => setCrop({ status: "idle" }),
    pending,
    committing,
    confirm: () => void confirm(),
    cancelUpload,
  };
}
