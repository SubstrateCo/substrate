import type { PictureKind } from "@substrate/contracts/files/pictures";

import { useEffect, useState } from "react";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type { CropArea } from "./crop-image";
import { ImageCropControls } from "./image-crop-controls";
import { ImageCropper } from "./image-cropper";
import { FormMessage } from "@/components/feedback/form-message";
import { usePictureUpload } from "@/components/upload/use-picture-upload";

export interface ImageCropDialogProps {
  file: File;
  kind: PictureKind;
  /** The caller's upload mutation state. */
  uploading: boolean;
  uploadError?: Error | null;
  /** Starts the upload mutation. Unmount the dialog when it succeeds; on failure the crop stays. */
  onUpload: (blob: Blob, context: PictureUploadContext) => void;
  onCancel: () => void;
  onRestoreFocus?: () => void;
}

export interface PictureUploadContext {
  signal: AbortSignal;
  /** Call immediately before the final, non-cancellable attachment request. */
  onCommit: () => void;
}

// Say what is saved and how it shows, so the round avatar mask and the square file agree.
function cropDescription(kind: ImageCropDialogProps["kind"], mode: "fit" | "fill") {
  if (kind === "avatar")
    return "Drag or use the arrow keys to position it. People see it in a circle.";
  if (kind === "project-icon")
    return "Drag or use the arrow keys to position it. The icon fills the square.";
  if (mode === "fit") return "The whole logo fits in a square, with clear space around it.";
  return "Drag or use the arrow keys to position it. The logo fills the square.";
}

/** Mount for one source file; unmount on cancel or successful confirmation. */
export function ImageCropDialog({
  file,
  kind,
  uploading,
  uploadError,
  onUpload,
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
  const upload = usePictureUpload({
    file,
    area,
    rotation,
    mode,
    uploading,
    uploadError,
    onUpload,
  });
  const { pending, committing, confirm, cancelUpload } = upload;
  const error = mediaFailed
    ? "This image could not be opened. Choose another image."
    : upload.error;
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // oxlint-disable-next-line react/set-state-in-effect -- This effect owns the object URL: publish it after creation and revoke it on cleanup, including Strict Mode replay.
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    upload.clearError();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {
              {
                avatar: "Edit profile picture",
                "organization-logo": "Edit organization logo",
                "project-icon": "Edit project icon",
              }[kind]
            }
          </DialogTitle>
          <DialogDescription>{cropDescription(kind, mode)}</DialogDescription>
        </DialogHeader>
        <DialogBody>
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
                  onError={() => setMediaFailed(true)}
                />
              </div>
            )}
            <ImageCropControls
              kind={kind}
              mode={mode}
              zoom={zoom}
              onModeChange={(next) => {
                reset();
                setMode(next);
              }}
              onZoomChange={(next) => {
                setArea(null);
                setZoom(next);
              }}
              onRotate={(degrees) => {
                setArea(null);
                setRotation((value) => (value + degrees + 360) % 360);
              }}
              onReset={reset}
            />
          </fieldset>
          <FormMessage error={error} />
          {pending && (
            <div className="space-y-2">
              <progress
                aria-label={committing ? "Finishing picture" : "Uploading picture"}
                className="w-full accent-primary"
              />
              <Button type="button" variant="outline" disabled={committing} onClick={cancelUpload}>
                Cancel upload
              </Button>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            aria-busy={pending}
            disabled={pending || mediaFailed || !src || (mode === "fill" && !area)}
            onClick={confirm}
          >
            Save picture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
