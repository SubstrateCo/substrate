import { useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "../primitives/button";
import { validateFiles } from "./file-validation";

export interface FileUploadProps {
  accept?: string;
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  description?: string;
  onFiles: (files: File[]) => void | Promise<void>;
}

export function FileUpload({
  accept,
  maxSize,
  multiple = false,
  disabled = false,
  label = "Choose files",
  description = "Drop files here, or choose files.",
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
        className={`flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 ${dragging ? "border-primary bg-accent" : "border-border bg-muted/30"}`}
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
        <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
        <p id={id} className="text-center text-sm text-muted-foreground">
          {description}
        </p>
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
          type="button"
          variant="outline"
          disabled={disabled || pending}
          aria-busy={pending}
          onClick={() => input.current?.click()}
        >
          {pending ? "Selecting…" : label}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
