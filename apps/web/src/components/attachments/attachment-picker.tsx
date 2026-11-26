import { useRef } from "react";

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
export function AttachmentDraftList({
  uploads,
  disabled,
  compact = false,
}: {
  uploads: AttachmentUploads;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <>
      {!!uploads.items.length && (
        <ul
          aria-label="Selected attachments"
          tabIndex={compact ? 0 : undefined}
          className={cn(
            compact
              ? "flex h-20 w-full min-w-0 items-start gap-2 overflow-x-auto overscroll-x-contain px-3 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : "grid gap-2",
          )}
        >
          {uploads.items.map((item) => (
            <Item
              key={item.id}
              asChild
              variant="outline"
              size="xs"
              className={cn("min-w-0 flex-nowrap", compact && "w-64 max-w-full shrink-0")}
            >
              <li>
                <AttachmentDraftMedia file={item.file} compact={compact} />
                <ItemContent className="min-w-0">
                  <ItemTitle className="max-w-full">
                    <span className="truncate">{item.file.name}</span>
                  </ItemTitle>
                  <ItemDescription role="status">
                    <span className={compact ? "block truncate" : undefined}>
                      {uploadStatus(item)}
                    </span>
                  </ItemDescription>
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
          ))}
        </ul>
      )}
      <FormMessage error={uploads.error} />
    </>
  );
}
