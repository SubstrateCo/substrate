import type { PictureKind } from "@substrate/contracts/files/pictures";

import { useState } from "react";

import type { CropArea } from "./crop-image";
import { ImageCropControls } from "./image-crop-controls";
import { ImageCropper } from "./image-cropper";
import { FormMessage } from "@/components/feedback/form-message";
import { modalDialogProps } from "@/components/feedback/modal-dialog";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { usePictureUpload } from "@/components/upload/use-picture-upload";

export interface ImageCropDialogProps {
  file: File;
  /** An object URL for `file`. The caller creates it and revokes it after the dialog closes. */
  src: string;
  kind: PictureKind;
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
  src,
  kind,
  uploading,
  uploadError,
  onUpload,
  onCancel,
  onRestoreFocus,
}: ImageCropDialogProps) {
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
  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    upload.clearError();
  }
  const modal = modalDialogProps({ pending, onClose: onCancel, onRestoreFocus });
  return (
    <Dialog {...modal.root}>
      <DialogContent {...modal.content}>
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
            <Progress aria-label={committing ? "Finishing picture" : "Uploading picture"} />
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={committing}
            onClick={pending ? cancelUpload : onCancel}
          >
            Cancel
          </Button>
          <PendingButton
            type="button"
            pending={pending}
            disabled={mediaFailed || (mode === "fill" && !area)}
            onClick={confirm}
          >
            Save picture
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
