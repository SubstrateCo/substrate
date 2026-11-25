import type { Attachment } from "@substrate/contracts/files/attachments";

import { useState } from "react";

import { imageFileActions } from "@/components/attachments/image-file-actions";
import { ActionContextMenu } from "@/components/layout/action-context-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Image } from "@/components/ui/image";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

export function ImageViewer({
  attachment,
  src,
  href,
  position,
  count,
  onPrevious,
  onNext,
  onClose,
}: {
  attachment: Attachment;
  src: string;
  href: string;
  position: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        size="lg"
        onKeyDown={(event) => {
          if (count < 2) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onPrevious();
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            onNext();
          }
        }}
      >
        <DialogHeader>
          <div className="min-w-0 pr-12">
            <DialogTitle className="truncate">{attachment.filename}</DialogTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="ghost" size="icon-sm" className="absolute top-4 right-14">
                  <a
                    href={href}
                    download={attachment.filename}
                    aria-label={`Download ${attachment.filename}`}
                  >
                    <Download aria-hidden="true" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download {attachment.filename}</TooltipContent>
            </Tooltip>
          </div>
          <DialogDescription>
            Image {position + 1} of {count}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ViewerImage key={src} src={src} href={href} attachment={attachment} />
          {count > 1 && (
            <div className="mt-2 hidden justify-center gap-2 pointer-coarse:flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Previous image"
                    onClick={onPrevious}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Previous image</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon-sm" aria-label="Next image" onClick={onNext}>
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Next image</TooltipContent>
              </Tooltip>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ViewerImage({
  src,
  href,
  attachment,
}: {
  src: string;
  href: string;
  attachment: Attachment;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const { filename, contentType } = attachment;
  return (
    <div className="grid min-h-24 place-items-center gap-2">
      {status === "loading" && <Spinner aria-label="Loading image" />}
      {status === "failed" && (
        <p role="status" className="text-sm text-muted-foreground">
          This image couldn’t be loaded. Try downloading the file.
        </p>
      )}
      {status !== "failed" && (
        <ActionContextMenu actions={[imageFileActions({ href, filename, contentType })]}>
          <Image
            src={src}
            alt={filename}
            loading="eager"
            className="max-h-96 w-full object-contain"
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("failed")}
          />
        </ActionContextMenu>
      )}
    </div>
  );
}
