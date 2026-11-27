import type { Attachment } from "@substrate/contracts/files/attachments";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react";

import { fitViewerImage } from "./image-viewer-layout";
import { imageFileActions } from "@/components/attachments/image-file-actions";
import { ActionContextMenu } from "@/components/layout/action-context-menu";
import { ActorAvatar } from "@/components/people/actor-avatar";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Image } from "@/components/ui/image";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActorIdentity } from "@/lib/actors/identity";
import { cn } from "cn";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export type ImageViewerSender = {
  actor: ActorIdentity;
  createdAt: string;
};

type ImageViewerProps = {
  attachment: Attachment;
  src: string;
  href: string;
  sender?: ImageViewerSender;
  position: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
};

export function ImageViewer(props: ImageViewerProps) {
  return <ImageViewerContent {...props} />;
}

function ImageViewerContent({
  attachment,
  src,
  href,
  sender,
  position,
  count,
  onPrevious,
  onNext,
  onClose,
}: ImageViewerProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [idle, setIdle] = useState(false);
  const [status, setStatus] = useState<ViewerStatus>("loading");
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState(attachment.id);
  if (selectedId !== attachment.id) {
    setSelectedId(attachment.id);
    setStatus("loading");
    setRotation(0);
    setZoom(1);
    setNatural({ width: 0, height: 0 });
    setIdle(false);
  }
  const actions = imageFileActions({
    href,
    filename: attachment.filename,
    contentType: attachment.contentType,
  });
  const fit = fitViewerImage(natural, viewport, rotation, zoom);
  const stageStyle: CSSProperties & Record<`--${string}`, string> = {
    "--viewer-width": `${fit.width}px`,
    "--viewer-height": `${fit.height}px`,
  };
  const imageStyle: CSSProperties & Record<`--${string}`, string> = {
    "--image-width": `${fit.imageWidth}px`,
    "--image-height": `${fit.imageHeight}px`,
    "--image-rotation": `${rotation}deg`,
  };

  const showControls = () => {
    clearTimeout(idleTimer.current);
    setIdle(false);
  };
  const viewingImage = () => {
    showControls();
    if (status !== "ready") return;
    idleTimer.current = setTimeout(() => {
      if (!dialog.current?.querySelector("[data-viewer-controls]:focus-within")) setIdle(true);
    }, 2500);
  };

  // The portal mounts after this component's first effect, so observe the actual ref attachment.
  const observeStage = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const controlsClass = cn(
    // oxlint-disable-next-line design/no-custom-motion -- Viewer chrome fades only after image-viewing inactivity.
    "relative z-10 transition-opacity duration-200 focus-within:pointer-events-auto focus-within:opacity-100 motion-reduce:transition-none",
    idle && "pointer-events-none opacity-0",
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        ref={dialog}
        showCloseButton={false}
        // oxlint-disable-next-line shadcn/no-restyle -- Media viewing needs a frameless, locally dark canvas, not the shared form-dialog shell.
        className="dark inset-0 top-0! left-0! h-full! max-h-none! w-full! max-w-none! translate-x-0 rounded-none! border-0! bg-background! text-foreground! shadow-none!"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dialog.current?.focus();
        }}
        onPointerMove={showControls}
        onFocusCapture={showControls}
        onKeyDown={(event) => {
          showControls();
          if (event.target !== event.currentTarget) return;
          if (count > 1 && event.key === "ArrowLeft") {
            event.preventDefault();
            onPrevious();
          }
          if (count > 1 && event.key === "ArrowRight") {
            event.preventDefault();
            onNext();
          }
        }}
      >
        {status === "ready" && (
          <div
            aria-hidden="true"
            data-slot="image-viewer-backdrop"
            className="pointer-events-none absolute inset-0 scale-125 opacity-60 blur-3xl"
          >
            <Image src={src} alt="" className="size-full object-cover" />
          </div>
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-radial from-transparent via-background/20 to-background/80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-linear-to-b from-background/70 via-transparent to-background/70"
        />
        <header
          data-viewer-controls
          className={cn(controlsClass, "flex shrink-0 items-center justify-between gap-4 p-6")}
        >
          <div className="flex min-w-0 items-center gap-3">
            {sender && <ActorAvatar actor={sender.actor} size="md" />}
            <div className="min-w-0">
              <DialogTitle className="truncate">{attachment.filename}</DialogTitle>
              <DialogDescription>
                {sender && (
                  <>
                    {sender.actor.name} · <Timestamp value={sender.createdAt} format="datetime" />{" "}
                    ·{" "}
                  </>
                )}
                Image {position + 1} of {count}
              </DialogDescription>
            </div>
          </div>
          <DialogClose asChild>
            <ViewerButton label="Close image viewer">
              <X aria-hidden="true" />
            </ViewerButton>
          </DialogClose>
        </header>
        <div ref={observeStage} className="relative z-0 min-h-0 flex-1 overflow-auto">
          <div
            className="grid h-(--viewer-height) min-h-full w-(--viewer-width) min-w-full grid-cols-1 grid-rows-1 place-items-center"
            style={stageStyle}
          >
            <ViewerStage
              status={status}
              image={
                <ActionContextMenu actions={[actions]}>
                  <Image
                    src={src}
                    alt={attachment.filename}
                    loading="eager"
                    draggable={false}
                    className={cn(
                      "col-start-1 row-start-1 h-(--image-height) w-(--image-width) max-w-none rotate-(--image-rotation) object-contain",
                      status !== "ready" && "invisible",
                    )}
                    style={imageStyle}
                    onLoad={(event) => {
                      setNatural({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      });
                      setStatus("ready");
                    }}
                    onError={() => setStatus("failed")}
                    onPointerMove={(event) => {
                      event.stopPropagation();
                      viewingImage();
                    }}
                    onPointerEnter={viewingImage}
                    onPointerLeave={showControls}
                    onPointerDown={() => {
                      dialog.current?.focus();
                      viewingImage();
                    }}
                  />
                </ActionContextMenu>
              }
            />
          </div>
        </div>
        <footer
          data-viewer-controls
          className={cn(
            controlsClass,
            "flex shrink-0 flex-wrap items-center justify-between gap-4 p-6",
          )}
        >
          <ViewerTools
            ready={status === "ready"}
            zoom={zoom}
            onRotate={() => setRotation((value) => (value + 90) % 360)}
            onZoom={setZoom}
          />
          {count > 1 && (
            <div role="group" aria-label="Image navigation" className="flex gap-0.5">
              <ViewerButton label="Previous image" onClick={onPrevious}>
                <ChevronLeft aria-hidden="true" />
              </ViewerButton>
              <ViewerButton label="Next image" onClick={onNext}>
                <ChevronRight aria-hidden="true" />
              </ViewerButton>
            </div>
          )}
          <div role="group" aria-label="Image file actions" className="ml-auto flex gap-0.5">
            {actions.map(({ label, icon: Icon, onSelect }) => (
              <ViewerButton key={label} label={label} onClick={onSelect}>
                <Icon aria-hidden="true" />
              </ViewerButton>
            ))}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="ghost" size="icon-sm">
                  <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open original image"
                  >
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open original image</TooltipContent>
            </Tooltip>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

type ViewerStatus = "loading" | "ready" | "failed";

/** The image, with a spinner over it until it loads. It stays mounted so its load event fires. */
function ViewerStage({ status, image }: { status: ViewerStatus; image: ReactNode }) {
  if (status === "failed")
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        This image couldn’t be loaded. Try downloading the file.
      </p>
    );
  return (
    <>
      {status === "loading" && <Spinner aria-label="Loading image" />}
      {image}
    </>
  );
}

/** Rotate and zoom, usable once the image has loaded. */
function ViewerTools({
  ready,
  zoom,
  onRotate,
  onZoom,
}: {
  ready: boolean;
  zoom: number;
  onRotate: () => void;
  onZoom: (update: (zoom: number) => number) => void;
}) {
  return (
    <div role="group" aria-label="Image view" className="flex items-center gap-0.5">
      <ViewerButton label="Rotate image" disabled={!ready} onClick={onRotate}>
        <RotateCw aria-hidden="true" />
      </ViewerButton>
      <ViewerButton
        label="Zoom out"
        disabled={!ready || zoom <= 1}
        onClick={() => onZoom((value) => Math.max(1, value - 0.5))}
      >
        <ZoomOut aria-hidden="true" />
      </ViewerButton>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Reset zoom"
        disabled={!ready}
        onClick={() => onZoom(() => 1)}
      >
        {Math.round(zoom * 100)}%
      </Button>
      <ViewerButton
        label="Zoom in"
        disabled={!ready || zoom >= 4}
        onClick={() => onZoom((value) => Math.min(4, value + 0.5))}
      >
        <ZoomIn aria-hidden="true" />
      </ViewerButton>
    </div>
  );
}

function ViewerButton({ label, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
