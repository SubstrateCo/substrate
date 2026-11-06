import { useEffect, useState } from "react";
import { ImageCropControls } from "./image-crop-controls";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../primitives/dialog";
import { Button } from "../primitives/button";
import { PendingButton } from "../feedback/pending-button";
import { ImageCropper } from "./image-cropper";
import type { CropArea } from "./crop-image";
import { usePictureUpload } from "@/ui/upload/image-crop-dialog/use-picture-upload";

export interface ImageCropDialogProps {
  file: File;
  kind: "avatar" | "organization-logo";
  onConfirm: (blob: Blob, context: PictureUploadContext) => Promise<void>;
  onCancel: () => void;
  onRestoreFocus?: () => void;
}

export interface PictureUploadContext {
  signal: AbortSignal;
  /** Upload percentage, from 0 to 100. Omit calls for indeterminate progress. */
  onProgress: (percentage: number) => void;
  /** Call immediately before the final, non-cancellable attachment request. */
  onCommit: () => void;
}

/** Mount for one source file; unmount on cancel or successful confirmation. */
export function ImageCropDialog({
  file,
  kind,
  onConfirm,
  onCancel,
  onRestoreFocus,
}: ImageCropDialogProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [mode, setMode] = useState<"fit" | "fill">(kind === "organization-logo" ? "fit" : "fill");
  const [area, setArea] = useState<CropArea | null>(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const { error, setError, pending, committing, progress, busy, confirm, cancelUpload } =
    usePictureUpload({ file, area, rotation, mode, onConfirm });
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // Synchronize the external object URL with the image element; revoke it on cleanup.
    // oxlint-disable-next-line react/set-state-in-effect
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setError(null);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy.current) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (busy.current) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy.current) event.preventDefault();
        }}
      >
        <DialogTitle>
          {kind === "avatar" ? "Edit profile picture" : "Edit organization logo"}
        </DialogTitle>
        <DialogDescription>
          {mode === "fit"
            ? "Keep the whole logo with transparent space around it."
            : "Drag the picture or use arrow keys to position it. Your saved image will be square."}
        </DialogDescription>
        <fieldset disabled={pending} className="min-w-0 space-y-3">
          {src && (
            <div inert={pending}>
              <ImageCropper
                src={src}
                kind={kind}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                mode={mode}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={setArea}
                onError={() => {
                  setMediaFailed(true);
                  setError("This image could not be opened. Choose another image.");
                }}
              />
            </div>
          )}
          <ImageCropControls
            kind={kind}
            mode={mode}
            zoom={zoom}
            pending={pending}
            onModeChange={(next) => {
              reset();
              setMode(next);
            }}
            onZoomChange={(next) => {
              setArea(null);
              setZoom(next);
            }}
            onRotate={() => {
              setArea(null);
              setRotation((value) => (value + 90) % 360);
            }}
            onReset={reset}
          />
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {pending && (
          <div className="space-y-2">
            <progress
              aria-label="Uploading picture"
              className="w-full accent-primary"
              max={100}
              value={progress}
            />
            <Button type="button" variant="outline" disabled={committing} onClick={cancelUpload}>
              Cancel upload
            </Button>
            {committing && (
              <p role="status" className="text-sm text-muted-foreground">
                Finishing picture…
              </p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <PendingButton
            type="button"
            pending={pending}
            pendingLabel="Saving picture…"
            disabled={mediaFailed || !src || (mode === "fill" && !area)}
            onClick={() => void confirm()}
          >
            Save picture
          </PendingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
