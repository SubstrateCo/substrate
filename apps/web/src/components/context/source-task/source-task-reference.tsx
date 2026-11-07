import { CopyButton } from "@/components/feedback/copy-button";
import { ChevronDown, Link2, LockKeyhole } from "lucide-react";

export function SourceTaskReference({
  sourceText,
  onCopy,
}: {
  sourceText: string;
  onCopy: () => void;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <details
        aria-label="Source message"
        className="group/source rounded-md border bg-muted/40 text-xs"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2.5 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <Link2 aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">Linked to this message</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 group-open/source:rotate-180" />
        </summary>
        <div className="space-y-3 px-3 pb-3">
          <blockquote className="max-h-40 overflow-y-auto border-l-2 border-primary/20 pl-3 wrap-anywhere whitespace-pre-wrap text-muted-foreground">
            {sourceText}
          </blockquote>
          <CopyButton
            size="sm"
            className="h-auto max-w-full whitespace-normal"
            onCopy={onCopy}
            label="Copy source text into description"
            successMessage="Source text copied into description"
            errorMessage="Couldn't copy source text into description"
          />
        </div>
      </details>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <LockKeyhole aria-hidden className="mt-0.5 size-3 shrink-0" />
        <span>
          Task access follows the selected project. The source message stays private to people who
          can access this conversation.
        </span>
      </p>
    </div>
  );
}
