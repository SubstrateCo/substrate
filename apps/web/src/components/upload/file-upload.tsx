import { useId, useRef, useState, type ReactNode, type Ref } from "react";

import { Button } from "../ui/button";
import { Field, FieldDescription, FieldError } from "../ui/field";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { validateFiles } from "./file-validation";

interface FileUploadProps {
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
  label?: string;
  description?: string;
  actions?: ReactNode;
  chooseButtonRef?: Ref<HTMLButtonElement>;
  onFiles: (files: File[]) => void | Promise<void>;
}

export function FileUpload({
  accept,
  maxSize,
  disabled = false,
  label = "Choose files",
  description = "Drop files here, or choose files.",
  actions,
  chooseButtonRef,
  onFiles,
}: FileUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const busy = useRef(false);
  async function select(files: File[]) {
    if (disabled || busy.current || !files.length) return;
    const invalid = validateFiles(files, { accept, maxSize });
    setError(invalid);
    if (invalid) return;
    busy.current = true;
    setPending(true);
    try {
      await onFiles(files);
    } catch {
      setError("We couldn't select these files. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <Field data-invalid={Boolean(error)}>
      <div
        className={`flex flex-col items-start gap-2 rounded-md p-1 ${dragging ? "bg-accent outline-2 outline-primary" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !pending) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void select(Array.from(event.dataTransfer.files));
        }}
      >
        <Input
          ref={input}
          type="file"
          hidden
          tabIndex={-1}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id} ${id}-error` : id}
          accept={accept}
          disabled={disabled || pending}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void select(files);
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            ref={chooseButtonRef}
            type="button"
            variant="outline"
            aria-label={pending ? "Selecting" : label}
            disabled={disabled || pending}
            aria-busy={pending}
            aria-describedby={error ? `${id} ${id}-error` : id}
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
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}
