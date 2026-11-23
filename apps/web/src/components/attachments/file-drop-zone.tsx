import { useRef, useState, type ReactNode } from "react";

import { cn } from "cn";
import { Paperclip } from "lucide-react";

export function FileDropZone({
  label,
  disabled,
  onFiles,
  children,
  className,
}: {
  label: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
  className?: string;
}) {
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  return (
    <div
      role="region"
      aria-label={label}
      className={cn("relative min-w-0", className)}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        depth.current++;
        if (!disabled) setOver(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        if (!disabled) onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {children}
      {over && !disabled && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-background/95 p-4 text-sm font-medium"
          role="status"
        >
          <Paperclip className="size-4" />
          Drop files to attach
        </div>
      )}
    </div>
  );
}
