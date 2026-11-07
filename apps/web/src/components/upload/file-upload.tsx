import { useId, useRef, useState, type Ref } from "react";

import { Button } from "../ui/button";
import { validateFiles } from "./file-validation";
import { Upload } from "lucide-react";

export interface FileUploadProps {
  accept?: string;
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  description?: string;
  compact?: boolean;
  chooseButtonRef?: Ref<HTMLButtonElement>;
  onFiles: (files: File[]) => void | Promise<void>;
}

export function FileUpload({
  accept,
  maxSize,
  multiple = false,
  disabled = false,
  label = "Choose files",
  description = "Drop files here, or choose files.",
  compact = false,
  chooseButtonRef,
  onFiles,
}: FileUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const busy = useRef(false);
  let dropzoneState = "";
  if (dragging) dropzoneState = "bg-accent outline-2 outline-primary";
  else if (!compact) dropzoneState = "border-border bg-muted/30";
  async function select(files: File[]) {
    if (disabled || busy.current || !files.length) return;
    const invalid = validateFiles(files, { accept, maxSize, multiple });
    setError(invalid);
    if (invalid) return;
    busy.current = true;
    setPending(true);
    try {
      await onFiles(files);
    } catch {
      setError("We couldn’t select these files. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div className="space-y-2">
      <div
        className={`${compact ? "flex flex-col items-start gap-2 rounded-md p-1" : "flex flex-col items-center gap-3 rounded-xl border border-dashed p-6"} ${dropzoneState}`}
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
        {!compact && <Upload className="size-5 text-muted-foreground" aria-hidden="true" />}
        <input
          ref={input}
          type="file"
          hidden
          tabIndex={-1}
          aria-label={label}
          aria-describedby={id}
          accept={accept}
          multiple={multiple}
          disabled={disabled || pending}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void select(files);
          }}
        />
        <Button
          ref={chooseButtonRef}
          type="button"
          variant="outline"
          disabled={disabled || pending}
          aria-busy={pending}
          onClick={() => input.current?.click()}
        >
          {pending ? "Selecting…" : label}
        </Button>
        <p
          id={id}
          className={
            compact ? "text-xs text-muted-foreground" : "text-center text-sm text-muted-foreground"
          }
        >
          {description}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
