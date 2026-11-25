import { useId, useRef, useState, type ReactNode, type Ref } from "react";

import { PendingButton } from "../feedback/pending-button";
import { validateFiles } from "./file-validation";
import { Field, FieldDescription, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

interface FileUploadProps {
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
  label?: string;
  description?: string;
  /** Shown at the start of the drop area, such as the current picture. */
  preview?: ReactNode;
  actions?: ReactNode;
  /** An error from the caller, such as an image that could not be opened. */
  error?: string | null;
  /** True while the caller's mutation checks the chosen files. */
  pending?: boolean;
  chooseButtonRef?: Ref<HTMLButtonElement>;
  onFiles: (files: File[]) => void;
}

/**
 * A bounded drop area with a Choose button. Only the error text turns red: the button stays a
 * normal action because it is how people recover.
 */
export function FileUpload({
  accept,
  maxSize,
  disabled = false,
  label = "Choose files",
  description = "Drop files here, or choose files.",
  preview,
  actions,
  error: externalError,
  pending = false,
  chooseButtonRef,
  onFiles,
}: FileUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [ownError, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const error = ownError ?? externalError ?? null;
  const blocked = disabled || pending;
  function select(files: File[]) {
    if (blocked || !files.length) return;
    const invalid = validateFiles(files, { accept, maxSize });
    setError(invalid);
    if (!invalid) onFiles(files);
  }
  const describedBy = error ? `${id} ${id}-error` : id;
  return (
    <Field>
      <FileUploadLayout
        data-dragging={dragging || undefined}
        className={cn(error && "border-destructive", dragging && "border-primary bg-accent")}
        onDragOver={(event) => {
          event.preventDefault();
          if (!blocked) setDragging(true);
        }}
        onDragLeave={(event) => {
          // Moving over a child fires dragleave on the parent; only leaving the area counts.
          // SAFETY: relatedTarget is the element the pointer entered, a DOM Node or null.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          select(Array.from(event.dataTransfer.files));
        }}
      >
        <FileUploadContent preview={preview}>
          <Input
            ref={input}
            type="file"
            hidden
            tabIndex={-1}
            aria-label={label}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            accept={accept}
            disabled={blocked}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              select(files);
            }}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <PendingButton
              ref={chooseButtonRef}
              type="button"
              variant="outline"
              disabled={blocked}
              pending={pending}
              aria-describedby={describedBy}
              onClick={() => input.current?.click()}
            >
              {label}
            </PendingButton>
            {actions}
          </div>
          <FieldDescription id={id} className="basis-full">
            {description}
          </FieldDescription>
        </FileUploadContent>
      </FileUploadLayout>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}

export function FileUploadContent({
  preview,
  children,
}: {
  preview?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {preview}
      <div className={cn("grid min-w-0 flex-1 gap-2", preview && "contents sm:grid")}>
        {children}
      </div>
    </>
  );
}

export function FileUploadLayout({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dashed p-3 transition-colors duration-150 ease-out sm:flex-nowrap sm:gap-4",
        className,
      )}
      {...props}
    />
  );
}
