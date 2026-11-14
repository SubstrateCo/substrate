import type { PictureKind } from "@substrate/contracts/files/pictures";

import { useMutation } from "@tanstack/react-query";

import { useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { openPicture, pictureErrorMessage } from "./crop-image";
import { FileUpload } from "./file-upload";
import { pictureAccept, pictureMaxSize } from "./file-validation";
import { ImageCropDialog, type PictureUploadContext } from "./image-crop-dialog";
import { PicturePreview } from "./picture-preview";
import { initials } from "@/lib/people/initials";
import { ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";

export interface PictureUploadProps {
  value?: string | null;
  kind: PictureKind;
  /** The caller's upload mutation state. */
  uploading: boolean;
  uploadError?: Error | null;
  /** Starts the upload mutation with a 512 × 512 PNG. A failure keeps the crop for retry. */
  onUpload: (
    input: PictureUploadContext & { file: File },
    options: { onSuccess: () => void },
  ) => void;
  /** The caller's remove mutation state. */
  removing: boolean;
  onRemove: (options: { onError: () => void }) => void;
  disabled?: boolean;
  /** Whose picture this is. Without a picture, the preview shows the initials people see elsewhere. */
  name?: string;
}

export function PictureUpload({
  value,
  kind,
  uploading,
  uploadError,
  onUpload,
  removing,
  onRemove,
  disabled = false,
  name: owner,
}: PictureUploadProps) {
  const [source, setSource] = useState<{ file: File; src: string } | null>(null);
  const chooseButton = useRef<HTMLButtonElement | null>(null);
  // Opening checks the image before the crop dialog shows it.
  const open = useMutation({
    mutationFn: async (file: File) => {
      (await openPicture(file)).close();
      return file;
    },
    onSuccess: (file) => setSource({ file, src: URL.createObjectURL(file) }),
  });
  function closeSource() {
    if (source) URL.revokeObjectURL(source.src);
    setSource(null);
  }
  const name = {
    avatar: "Profile picture",
    "organization-logo": "Organization logo",
    "project-icon": "Project icon",
  }[kind];
  const fallback = owner?.trim() ? (
    <span className="text-lg font-medium text-muted-foreground">{initials(owner)}</span>
  ) : (
    <ImageIcon
      className="size-7 text-muted-foreground"
      aria-label={value ? `${name} unavailable` : `No ${name.toLowerCase()}`}
    />
  );
  return (
    <section aria-label={name} className="min-w-0">
      <FileUpload
        chooseButtonRef={chooseButton}
        accept={pictureAccept}
        maxSize={pictureMaxSize}
        disabled={disabled || removing || uploading || !!source}
        pending={open.isPending}
        label={value ? "Replace picture" : "Choose picture"}
        description="Drop an image here. JPEG, PNG, or WebP, up to 5 MB."
        error={open.error && pictureErrorMessage(open.error)}
        preview={
          kind === "avatar" ? (
            <Avatar variant="picture" className="size-16 shrink-0">
              <AvatarImage src={value ?? undefined} alt={name} className="object-contain" />
              <AvatarFallback>{fallback}</AvatarFallback>
            </Avatar>
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
              <PicturePreview
                src={value}
                alt={name}
                className="size-full object-contain"
                fallback={fallback}
              />
            </div>
          )
        }
        actions={
          value && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="destructive-ghost"
                  size="icon"
                  disabled={disabled || !!source || removing || uploading}
                  aria-busy={removing}
                  aria-label={removing ? "Removing picture." : "Remove picture"}
                  onClick={() => {
                    open.reset();
                    onRemove({
                      onError: () =>
                        toast.error("We couldn’t remove this picture. Please try again."),
                    });
                  }}
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
          )
        }
        onFiles={([file]) => open.mutate(file)}
      />
      {source && (
        <ImageCropDialog
          file={source.file}
          src={source.src}
          kind={kind}
          uploading={uploading}
          uploadError={uploadError}
          onRestoreFocus={() => chooseButton.current?.focus()}
          onCancel={closeSource}
          onUpload={(blob, context) =>
            onUpload(
              { file: new File([blob], `${kind}.png`, { type: "image/png" }), ...context },
              { onSuccess: closeSource },
            )
          }
        />
      )}
    </section>
  );
}
