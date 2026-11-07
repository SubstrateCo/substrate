import { useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { openPicture } from "./crop-image";
import { FileUpload } from "./file-upload";
import { pictureAccept, pictureMaxSize } from "./file-validation";
import { ImageCropDialog, type PictureUploadContext } from "./image-crop-dialog";
import { PicturePreview } from "./picture-preview";
import { ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
  const name = kind === "avatar" ? "Profile picture" : "Organization logo";
  async function remove() {
    if (removing) return;
    setRemoving(true);
    setError(null);
    try {
      await onRemove();
    } catch {
      toast.error("We couldn’t remove this picture. Please try again.");
    } finally {
      setRemoving(false);
    }
  }
  return (
    <section aria-label={name} className="flex items-start gap-4">
      {kind === "avatar" ? (
        <Avatar variant="picture" className="size-16 shrink-0">
          <AvatarImage src={value ?? undefined} alt={name} className="object-contain" />
          <AvatarFallback>
            <ImageIcon
              className="size-7 text-muted-foreground"
              aria-label={value ? `${name} unavailable` : `No ${name.toLowerCase()}`}
            />
          </AvatarFallback>
        </Avatar>
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          <PicturePreview
            src={value}
            alt={name}
            className="size-full object-contain"
            fallback={
              <ImageIcon
                className="size-7 text-muted-foreground"
                aria-label={value ? `${name} unavailable` : `No ${name.toLowerCase()}`}
              />
            }
          />
        </div>
      )}
      <div className="grid min-w-0 flex-1 gap-2">
        <FileUpload
          chooseButtonRef={chooseButton}
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  disabled={disabled || !!source || removing}
                  aria-busy={removing}
                  aria-label={removing ? "Removing picture…" : "Remove picture"}
                  onClick={() => void remove()}
                >
                  {removing ? (
                    <Spinner aria-hidden="true" role="presentation" />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove picture</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {error && (
          <p role="alert" className="w-full text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
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
