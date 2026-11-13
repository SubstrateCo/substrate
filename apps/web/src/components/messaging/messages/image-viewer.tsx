import type { Attachment } from "@substrate/contracts/files/attachments";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Download } from "lucide-react";

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
          <ViewerImage key={src} src={src} filename={attachment.filename} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ViewerImage({ src, filename }: { src: string; filename: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  return (
    <div className="grid min-h-24 place-items-center gap-2">
      {status !== "ready" && (
        <p role="status" className="text-sm text-muted-foreground">
          {status === "failed"
            ? "This image couldn’t be loaded. Try downloading the file."
            : "Loading image…"}
        </p>
      )}
      {status !== "failed" && (
        <img
          src={src}
          alt={filename}
          className="max-h-96 w-full object-contain"
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("failed")}
        />
      )}
    </div>
  );
}
