import type { PictureKind } from "@substrate/contracts/files/pictures";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selection, setSelection] = useState<
    { status: "idle" | "opening" } | { status: "failed"; error: string }
  >({ status: "idle" });
  const opening = useRef<AbortController | null>(null);
  const chooseButton = useRef<HTMLButtonElement | null>(null);
  useEffect(
    () => () => {
      opening.current?.abort();
      opening.current = null;
    },
    [],
  );
  const attachPreview = useCallback(
    (section: HTMLElement | null) => {
      if (!section || !selectedFile) return;
      const src = URL.createObjectURL(selectedFile);
      setSource({ file: selectedFile, src });
      return () => URL.revokeObjectURL(src);
    },
    [selectedFile],
  );
  // Opening checks the image before the crop dialog shows it.
  async function open(file: File) {
    if (opening.current) return;
    const controller = new AbortController();
    opening.current = controller;
    setSelection({ status: "opening" });
    try {
      (await openPicture(file, controller.signal)).close();
      if (!controller.signal.aborted) {
        setSelectedFile(file);
        setSelection({ status: "idle" });
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setSelection({
          status: "failed",
          error:
            error instanceof Error ? pictureErrorMessage(error) : "This image could not be opened.",
        });
    }
    if (opening.current === controller) opening.current = null;
  }
  function closeSource() {
    setSelectedFile((current) => (current === source?.file ? null : current));
    setSource((current) => (current === source ? null : current));
  }
  const name = {
    avatar: "Profile picture",
    "organization-logo": "Organization logo",
    "project-icon": "Project icon",
  }[kind];
  const busy = disabled || removing || uploading || !!selectedFile;
  return (
    <section ref={attachPreview} aria-label={name} className="min-w-0">
      <FileUpload
        chooseButtonRef={chooseButton}
        accept={pictureAccept}
        maxSize={pictureMaxSize}
        disabled={busy}
        pending={selection.status === "opening"}
        label={value ? "Replace picture" : "Choose picture"}
        description="Drop an image here. JPEG, PNG, or WebP, up to 5 MB."
        error={selection.status === "failed" ? selection.error : null}
        preview={<CurrentPicture kind={kind} value={value} name={name} owner={owner} />}
        actions={
          value && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="destructive-ghost"
                  size="icon"
                  disabled={busy}
                  aria-busy={removing}
                  aria-label={removing ? "Removing picture." : "Remove picture"}
                  onClick={() => {
                    opening.current?.abort();
                    opening.current = null;
                    setSelection({ status: "idle" });
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
        onFiles={([file]) => void open(file)}
      />
      {source && source.file === selectedFile && (
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

function CurrentPicture({
  kind,
  value,
  name,
  owner,
}: Pick<PictureUploadProps, "kind" | "value"> & { name: string; owner?: string }) {
  const fallback = owner?.trim() ? (
    <span className="text-lg font-medium text-muted-foreground">{initials(owner)}</span>
  ) : (
    <ImageIcon
      className="size-7 text-muted-foreground"
      aria-label={value ? `${name} unavailable` : `No ${name.toLowerCase()}`}
    />
  );
  if (kind === "avatar") {
    return (
      <Avatar variant="picture" className="size-16 shrink-0">
        <AvatarImage src={value ?? undefined} alt={name} className="object-contain" />
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
    );
  }
  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
      <PicturePreview
        src={value}
        alt={name}
        className="size-full object-contain"
        fallback={fallback}
      />
    </div>
  );
}
