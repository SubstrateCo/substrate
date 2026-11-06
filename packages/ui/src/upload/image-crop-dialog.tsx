import { useEffect, useRef, useState } from "react";
import { ImageCropControls } from "./image-crop-controls";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../primitives/dialog";
import { Button } from "../primitives/button";
import { PendingButton } from "../feedback/pending-button";
import { ImageCropper } from "./image-cropper";
import { cropImage, type CropArea } from "./crop-image";

export interface ImageCropDialogProps {
  file: File;
  kind: "avatar" | "organization-logo";
  onConfirm: (blob: Blob, context: PictureUploadContext) => Promise<void>;
  onCancel: () => void;
}

export interface PictureUploadContext {
  signal: AbortSignal;
  /** Upload percentage, from 0 to 100. Omit calls for indeterminate progress. */
  onProgress: (percentage: number) => void;
  /** Call immediately before the final, non-cancellable attachment request. */
  onCommit: () => void;
}

/** Mount for one source file; unmount on cancel or successful confirmation. */
export function ImageCropDialog({ file, kind, onConfirm, onCancel }: ImageCropDialogProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [mode, setMode] = useState<"fit" | "fill">(kind === "organization-logo" ? "fit" : "fill");
  const [area, setArea] = useState<CropArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [committing, setCommitting] = useState(false);
  const committed = useRef(false);
  const [progress, setProgress] = useState<number | undefined>();
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // Synchronize the external object URL with the image element; revoke it on cleanup.
    // oxlint-disable-next-line react/set-state-in-effect
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(
    () => () => {
      if (!committed.current) controller.current?.abort();
    },
    [],
  );
  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setError(null);
  }
  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    committed.current = false;
    setCommitting(false);
    const request = new AbortController();
    controller.current = request;
    setProgress(undefined);
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
        onProgress: (value) => {
          if (!request.signal.aborted && Number.isFinite(value))
            setProgress(Math.max(0, Math.min(100, value)));
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
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy.current) onCancel();
      }}
    >
      <DialogContent
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
            <Button
              type="button"
              variant="ghost"
              disabled={committing}
              onClick={() => {
                if (!committed.current) controller.current?.abort();
              }}
            >
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
