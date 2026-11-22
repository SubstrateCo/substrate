import { useRef } from "react";

import { FormMessage } from "@/components/feedback/form-message";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AttachmentDraft, AttachmentUploads } from "@/queries/files/use-attachment-uploads";
import { FileText, Paperclip, RefreshCw, X } from "lucide-react";

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
  if (item.progress === 100) return "Finishing upload…";
  return `Uploading ${item.progress}%`;
}
export function AttachmentDraftList({
  uploads,
  disabled,
}: {
  uploads: AttachmentUploads;
  disabled?: boolean;
}) {
  return (
    <>
      {!!uploads.items.length && (
        <ul aria-label="Selected attachments" className="grid gap-2">
          {uploads.items.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
            >
              <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate">{item.file.name}</p>
                <p className="text-xs text-muted-foreground" role="status">
                  {uploadStatus(item)}
                </p>
              </div>
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
            </li>
          ))}
        </ul>
      )}
      <FormMessage error={uploads.error} />
    </>
  );
}
