import { useRef, type ReactNode } from "react";

import { AttachmentDraftMedia } from "@/components/attachments/attachment-draft-media";
import { FormMessage } from "@/components/feedback/form-message";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AttachmentDraft, AttachmentUploads } from "@/queries/files/use-attachment-uploads";
import { cn } from "cn";
import { Paperclip, RefreshCw, X } from "lucide-react";

export function AttachFilesButton({
  onFiles,
  disabled,
  iconOnly = false,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  iconOnly?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-label="Choose attachment files"
        disabled={disabled}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={iconOnly ? "icon-sm" : "sm"}
            aria-label="Attach files"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <Paperclip />
            {!iconOnly && "Attach files"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Attach files</TooltipContent>
      </Tooltip>
    </>
  );
}
function uploadStatus(item: AttachmentDraft) {
  if (item.status === "ready") return "Ready to attach";
  if (item.status === "failed") return "Upload failed. Try again.";
  if (item.progress === 100) return "Finishing upload";
  return `Uploading ${item.progress}%`;
}
type DraftListProps = { uploads: AttachmentUploads; disabled?: boolean };

/** The files chosen for a task, one under another with a large preview. */
export function AttachmentDraftList({ uploads, disabled }: DraftListProps) {
  return (
    <>
      {!!uploads.items.length && (
        <ul aria-label="Selected attachments" className="grid gap-2">
          {uploads.items.map((item) => (
            <DraftItem
              key={item.id}
              item={item}
              uploads={uploads}
              disabled={disabled}
              media={<AttachmentDraftMedia file={item.file} />}
              status={uploadStatus(item)}
            />
          ))}
        </ul>
      )}
      <FormMessage error={uploads.error} />
    </>
  );
}

/** The files chosen in the composer, in one scrolling row of small previews. */
export function ComposerDraftStrip({ uploads, disabled }: DraftListProps) {
  return (
    <>
      {!!uploads.items.length && (
        <ul
          aria-label="Selected attachments"
          tabIndex={0}
          className="flex h-20 w-full min-w-0 items-start gap-2 overflow-x-auto overscroll-x-contain px-3 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {uploads.items.map((item) => (
            <DraftItem
              key={item.id}
              item={item}
              uploads={uploads}
              disabled={disabled}
              className="w-64 max-w-full shrink-0"
              media={<AttachmentDraftMedia file={item.file} compact />}
              status={<span className="block truncate">{uploadStatus(item)}</span>}
            />
          ))}
        </ul>
      )}
      <FormMessage error={uploads.error} />
    </>
  );
}

function DraftItem({
  item,
  uploads,
  disabled,
  className,
  media,
  status,
}: {
  item: AttachmentDraft;
  uploads: AttachmentUploads;
  disabled?: boolean;
  className?: string;
  media: ReactNode;
  status: ReactNode;
}) {
  return (
    <Item asChild variant="outline" size="xs" className={cn("min-w-0 flex-nowrap", className)}>
      <li>
        {media}
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full">
            <span className="truncate">{item.file.name}</span>
          </ItemTitle>
          <ItemDescription role="status">{status}</ItemDescription>
        </ItemContent>
        <ItemActions>
          {item.status === "failed" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Retry ${item.file.name}`}
                  disabled={disabled}
                  onClick={() => uploads.retry(item.id)}
                >
                  <RefreshCw />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Retry {item.file.name}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${item.file.name}`}
                disabled={disabled}
                onClick={() => uploads.remove(item.id)}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove {item.file.name}</TooltipContent>
          </Tooltip>
        </ItemActions>
      </li>
    </Item>
  );
}
