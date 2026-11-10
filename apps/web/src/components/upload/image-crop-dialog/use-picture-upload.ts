import { useEffect, useRef, useState } from "react";

import { cropImage, type CropArea } from "@/components/upload/crop-image";
import type { ImageCropDialogProps } from "@/components/upload/image-crop-dialog";

export function usePictureUpload({
  file,
  area,
  rotation,
  mode,
  onConfirm,
}: Pick<ImageCropDialogProps, "file" | "onConfirm"> & {
  area: CropArea | null;
  rotation: number;
  mode: "fit" | "fill";
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [committing, setCommitting] = useState(false);
  const committed = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  useEffect(
    () => () => {
      if (!committed.current) controller.current?.abort();
    },
    [],
  );
  function cancelUpload() {
    if (!committed.current) controller.current?.abort();
  }
  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    committed.current = false;
    setCommitting(false);
    const request = new AbortController();
    controller.current = request;
    setPending(true);
    setError(null);
    try {
      const blob = await cropImage(file, area, rotation, mode);
      request.signal.throwIfAborted();
      await onConfirm(blob, {
        signal: request.signal,
        onCommit: () => {
          committed.current = true;
          setCommitting(true);
        },
      });
    } catch {
      setError(
        request.signal.aborted
          ? "Upload cancelled. Your crop is still here."
          : "We couldn’t save this picture. Your crop is still here. Please try again.",
      );
    } finally {
      busy.current = false;
      controller.current = null;
      setPending(false);
    }
  }
  return { error, setError, pending, committing, busy, confirm, cancelUpload };
}
