import type { Attachment } from "@substrate/contracts/files/attachments";

import { useState } from "react";

import { AttachmentList } from "@/components/attachments/attachment-list";
import { Skeleton } from "@/components/ui/skeleton";

export function ImageThumbnail({
  attachment,
  src,
  href,
  onOpen,
}: {
  attachment: Attachment;
  src: string;
  href: string;
  onOpen: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  if (status === "failed")
    return <AttachmentList attachments={[attachment]} href={() => href} compact />;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Preview ${attachment.filename}`}
      className="relative block w-full cursor-zoom-in overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {status === "loading" && <Skeleton className="absolute inset-0" />}
      <img
        src={src}
        alt={attachment.filename}
        loading="lazy"
        decoding="async"
        className="max-h-64 min-h-24 w-full object-contain"
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("failed")}
      />
    </button>
  );
}
