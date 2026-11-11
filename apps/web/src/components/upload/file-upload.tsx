import { useId, useRef, useState, type ReactNode, type Ref } from "react";

import { Button } from "../ui/button";
import { Field, FieldDescription, FieldError } from "../ui/field";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { validateFiles } from "./file-validation";
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
      <div
        data-dragging={dragging || undefined}
        className={cn(
          "flex min-w-0 items-center gap-4 rounded-lg border border-dashed p-3 transition-colors duration-150 ease-out",
          error && "border-destructive/50",
          dragging && "border-primary bg-accent",
        )}
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
        {preview}
        <div className="grid min-w-0 flex-1 gap-2">
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              ref={chooseButtonRef}
              type="button"
              variant="outline"
              aria-label={pending ? "Selecting" : label}
              disabled={blocked}
              aria-busy={pending}
              aria-describedby={describedBy}
              onClick={() => input.current?.click()}
            >
              {pending ? (
                <>
                  <Spinner aria-hidden="true" role="presentation" />
                  Selecting
                </>
              ) : (
                label
              )}
            </Button>
            {actions}
          </div>
          <FieldDescription id={id}>{description}</FieldDescription>
        </div>
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}
