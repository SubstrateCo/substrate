import type { PictureKind } from "@substrate/contracts/files/pictures";

import { useEffect, useRef, useState } from "react";

import { openPicture, pictureErrorMessage } from "./crop-image";
import { FileUpload, FileUploadContent, FileUploadLayout } from "./file-upload";
import { pictureAccept, pictureMaxSize } from "./file-validation";
import { ImageCropDialog, type PictureUploadContext } from "./image-crop-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription } from "@/components/ui/field";
import { Image } from "@/components/ui/image";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

export function PictureUploadLoading({ kind, label }: { kind: PictureKind; label: string }) {
  return (
    <div role="status" aria-label={label}>
      <Field aria-hidden="true">
        <FileUploadLayout>
          <FileUploadContent
            preview={
              <span
                className={
                  kind === "avatar"
                    ? "size-16 shrink-0 overflow-hidden rounded-full"
                    : "size-16 shrink-0 overflow-hidden rounded-lg"
                }
              >
                <Skeleton className="size-full" />
              </span>
            }
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-28" />
            </div>
            <FieldDescription className="basis-full">
              Drop an image here. JPEG, PNG, or WebP, up to 5 MB.
            </FieldDescription>
          </FileUploadContent>
        </FileUploadLayout>
      </Field>
    </div>
  );
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
  // The preview URL lives as long as its crop dialog.
  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source.src);
  }, [source]);
  // Opening checks the image before the crop dialog shows it.
  async function open(file: File) {
    if (opening.current) return;
    const controller = new AbortController();
    opening.current = controller;
    setSelection({ status: "opening" });
    try {
      (await openPicture(file, controller.signal)).close();
      if (!controller.signal.aborted) {
        setSource({ file, src: URL.createObjectURL(file) });
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
    setSource((current) => (current === source ? null : current));
  }
  const name = {
    avatar: "Profile picture",
    "organization-logo": "Organization logo",
    "project-icon": "Project icon",
  }[kind];
  const busy = disabled || removing || uploading || !!source;
  return (
    <section aria-label={name} className="min-w-0">
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
            <RemovePictureButton
              removing={removing}
              disabled={busy}
              onRemove={() => {
                opening.current?.abort();
                opening.current = null;
                setSelection({ status: "idle" });
                onRemove({
                  onError: () => toast.error("We couldn’t remove this picture. Please try again."),
                });
              }}
            />
          )
        }
        onFiles={([file]) => void open(file)}
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

/** Removes the picture at once: it can be uploaded again. */
function RemovePictureButton({
  removing,
  disabled,
  onRemove,
}: {
  removing: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const label = removing ? "Removing picture." : "Remove picture";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="destructive-ghost"
          size="icon"
          disabled={disabled}
          aria-busy={removing}
          aria-label={label}
          onClick={onRemove}
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
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
      <Image src={value} alt={name} className="size-full object-contain" fallback={fallback} />
    </div>
  );
}
