import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { FileUpload } from "./file-upload";
import { ImageCropDialog, type PictureUploadContext } from "./image-crop-dialog";
import { pictureAccept, pictureMaxSize } from "./file-validation";
import { openPicture } from "./crop-image";
import { PendingButton } from "../feedback/pending-button";

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
    <section aria-label={name} className="space-y-3">
      <div
        className={`flex size-20 items-center justify-center overflow-hidden border border-border bg-muted ${kind === "avatar" ? "rounded-full" : "rounded-xl"}`}
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
        accept={pictureAccept}
        maxSize={pictureMaxSize}
        disabled={disabled || removing || !!source}
        label={value ? "Replace picture" : "Choose picture"}
        description="JPEG, PNG, or WebP. Up to 5 MB."
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
          variant="ghost"
          disabled={disabled || !!source}
          pending={removing}
          pendingLabel="Removing picture…"
          onClick={() => void remove()}
        >
          Remove picture
        </PendingButton>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {source && (
        <ImageCropDialog
          file={source}
          kind={kind}
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
