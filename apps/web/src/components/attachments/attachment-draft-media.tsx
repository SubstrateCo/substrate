import { useEffect, useState } from "react";

import { Image } from "@/components/ui/image";
import { ItemMedia } from "@/components/ui/item";
import { cn } from "cn";
import { FileText } from "lucide-react";

const previewTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function AttachmentDraftMedia({ file, compact = false }: { file: File; compact?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!previewTypes.has(file.type)) return;
    const url = URL.createObjectURL(file);
    // oxlint-disable-next-line react/set-state-in-effect -- Bind this browser resource after commit so abandoned renders cannot leak blob URLs; effect cleanup releases it.
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const fallback = <FileText aria-hidden="true" className="text-muted-foreground" />;
  return (
    <ItemMedia variant="icon" className={compact ? "size-10" : undefined}>
      <Image
        src={src}
        alt={`Preview of ${file.name}`}
        loading="eager"
        className={cn("rounded-md object-contain", compact ? "size-10" : "h-20 w-28")}
        fallback={fallback}
      />
    </ItemMedia>
  );
}
