import { useMutation } from "@tanstack/react-query";

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
  // The dialog closes without asking while an upload runs only when its page goes away.
  const attempt = useRef<{ controller: AbortController; committed: boolean } | null>(null);
  useEffect(
    () => () => {
      if (!attempt.current?.committed) attempt.current?.controller.abort();
    },
    [],
  );
  const crop = useMutation({
    mutationFn: async ({ controller }: { controller: AbortController }) => {
      const blob = await cropImage(file, area, rotation, mode, controller.signal);
      controller.signal.throwIfAborted();
      return blob;
    },
  });
  const pending = crop.isPending || uploading;
  // An upload error belongs to this dialog only after its crop was handed off.
  const failure = crop.error ?? (crop.isSuccess ? uploadError : null);
  let error: string | null = null;
  if (failure)
    error = crop.variables?.controller.signal.aborted
      ? "Upload cancelled. Your crop is still here."
      : "We couldn’t save this picture. Your crop is still here. Please try again.";
  function confirm() {
    if (pending) return;
    const current = { controller: new AbortController(), committed: false };
    attempt.current = current;
    setCommitting(false);
    crop.mutate(
      { controller: current.controller },
      {
        onSuccess: (blob) =>
          onUpload(blob, {
            signal: current.controller.signal,
            onCommit: () => {
              current.committed = true;
              setCommitting(true);
            },
          }),
      },
    );
  }
  function cancelUpload() {
    if (!attempt.current?.committed) attempt.current?.controller.abort();
  }
  return { error, clearError: crop.reset, pending, committing, confirm, cancelUpload };
}
