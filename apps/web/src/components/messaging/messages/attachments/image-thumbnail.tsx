import type { Attachment } from "@substrate/contracts/files/attachments";

import { useState } from "react";

import { AttachmentList } from "@/components/attachments/attachment-list";
import { imageFileActions } from "@/components/attachments/image-file-actions";
import { ActionContextMenu } from "@/components/layout/action-context-menu";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
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
    <ActionContextMenu
      actions={[
        imageFileActions({
          href,
          filename: attachment.filename,
          contentType: attachment.contentType,
          onOpen,
        }),
      ]}
    >
      <Pressable
        onClick={onOpen}
        aria-label={`Preview ${attachment.filename}`}
        className="relative block w-full cursor-zoom-in overflow-hidden rounded-md bg-muted"
      >
        {status === "loading" && <Skeleton className="absolute inset-0" />}
        <Image
          src={src}
          alt={attachment.filename}
          className="max-h-64 min-h-24 w-full object-contain"
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("failed")}
        />
      </Pressable>
    </ActionContextMenu>
  );
}
