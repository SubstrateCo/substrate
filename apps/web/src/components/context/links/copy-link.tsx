import { CopyButton } from "@/components/feedback/copy-button";
import { useRecordUrl } from "@/hooks/use-record-url";
import type { RecordLink } from "@/lib/navigation/record-links";

export function CopyLink({
  link,
  label = "Copy link",
  grouped = false,
}: {
  link: RecordLink;
  label?: string;
  grouped?: boolean;
}) {
  const recordUrl = useRecordUrl();
  return (
    <CopyButton
      size={grouped ? "icon-sm" : "icon-xs"}
      grouped={grouped}
      label={label}
      onCopy={() => navigator.clipboard.writeText(recordUrl(link))}
      successMessage="Link copied"
      errorMessage="Couldn't copy link"
    />
  );
}
