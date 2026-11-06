import { useRef, useState } from "react";

import { PendingButton } from "../feedback/pending-button";
import { openPicture } from "./crop-image";
import { FileUpload } from "./file-upload";
import { pictureAccept, pictureMaxSize } from "./file-validation";
import { ImageCropDialog, type PictureUploadContext } from "./image-crop-dialog";
import { ImageIcon } from "lucide-react";

export interface PictureUploadProps {
  value?: string | null;
  kind: "avatar" | "organization-logo";
  /** Receives a 512 × 512 PNG; reject to preserve the crop for retry. */
  onUpload: (file: File, context: PictureUploadContext) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
}

export function PictureUpload({
  value,
  kind,
  onUpload,
  onRemove,
  disabled = false,
}: PictureUploadProps) {
  const [source, setSource] = useState<File | null>(null);
  const chooseButton = useRef<HTMLButtonElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const name = kind === "avatar" ? "Profile picture" : "Organization logo";
  async function remove() {
    if (removing) return;
    setRemoving(true);
    setError(null);
    try {
      await onRemove();
    } catch {
      setError("We couldn’t remove this picture. Please try again.");
    } finally {
      setRemoving(false);
    }
  }
  return (
    <section aria-label={name} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div
        className={`flex size-12 shrink-0 items-center justify-center overflow-hidden border border-border bg-muted ${kind === "avatar" ? "rounded-full" : "rounded-lg"}`}
      >
        {value && unavailable !== value ? (
          <img
            src={value}
            alt={name}
            className="size-full object-contain"
            onError={() => setUnavailable(value)}
          />
        ) : (
          <ImageIcon
            className="size-7 text-muted-foreground"
            aria-label={value ? `${name} unavailable` : `No ${name.toLowerCase()}`}
          />
        )}
      </div>
      <FileUpload
        chooseButtonRef={(button) => {
          chooseButton.current = button;
        }}
        compact
        accept={pictureAccept}
        maxSize={pictureMaxSize}
        disabled={disabled || removing || !!source}
        label={value ? "Replace picture" : "Choose picture"}
        description="JPEG, PNG, or WebP. Up to 5 MB. Drop an image here."
        onFiles={async ([file]) => {
          setError(null);
          try {
            const image = await openPicture(file);
            image.close();
            setSource(file);
          } catch (failure) {
            setError(
              failure instanceof Error ? failure.message : "This image could not be opened.",
            );
          }
        }}
      />
      {value && (
        <PendingButton
          type="button"
          variant="outline"
          disabled={disabled || !!source}
          pending={removing}
          pendingLabel="Removing picture…"
          onClick={() => void remove()}
        >
          Remove picture
        </PendingButton>
      )}
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
      {source && (
        <ImageCropDialog
          file={source}
          kind={kind}
          onRestoreFocus={() => chooseButton.current?.focus()}
          onCancel={() => setSource(null)}
          onConfirm={async (blob, context) => {
            await onUpload(
              new File([blob], kind === "avatar" ? "avatar.png" : "organization-logo.png", {
                type: "image/png",
              }),
              context,
            );
            setSource(null);
          }}
        />
      )}
    </section>
  );
}

export type { PictureUploadContext } from "./image-crop-dialog";
