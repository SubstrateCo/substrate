import type { Attachment } from "@substrate/contracts/files/attachments";

import { useState } from "react";

import { AttachmentList } from "@/components/attachments/attachment-list";
import { ImageThumbnail } from "@/components/messaging/messages/attachments/image-thumbnail";
import { ImageViewer, type ImageViewerSender } from "@/components/messaging/messages/attachments/image-viewer";

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function MessageAttachments({
  attachments,
  href,
  previewHref,
  sender,
}: {
  attachments: Attachment[];
  href: (attachment: Attachment) => string;
  previewHref: (attachment: Attachment) => string;
  sender?: ImageViewerSender;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const images = attachments.filter((attachment) => imageTypes.has(attachment.contentType));
  const files = attachments.filter((attachment) => !imageTypes.has(attachment.contentType));
  const position = images.findIndex((attachment) => attachment.id === selectedId);
  const selected = images.find((attachment) => attachment.id === selectedId);
  return (
    <>
      {!!images.length && (
        <ul
          aria-label="Image attachments"
          className="my-2 grid max-w-md grid-cols-1 items-start gap-2 sm:grid-cols-2"
        >
          {images.map((attachment) => (
            <li key={attachment.id} className="min-w-0">
              <ImageThumbnail
                attachment={attachment}
                src={previewHref(attachment)}
                href={href(attachment)}
                onOpen={() => setSelectedId(attachment.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <AttachmentList attachments={files} href={href} compact />
      {selected && (
        <ImageViewer
          sender={sender}
          attachment={selected}
          src={previewHref(selected)}
          href={href(selected)}
          position={position}
          count={images.length}
          onPrevious={() =>
            setSelectedId(images[(position - 1 + images.length) % images.length]!.id)
          }
          onNext={() => setSelectedId(images[(position + 1) % images.length]!.id)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
