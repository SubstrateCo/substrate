import { CopyButton } from "@/components/feedback/copy-button";

export function CopyLink({
  onCopy,
  label = "Copy link",
  grouped = false,
}: {
  onCopy: () => Promise<void>;
  label?: string;
  grouped?: boolean;
}) {
  return (
    <CopyButton
      iconOnly
      size={grouped ? "icon" : "icon-xs"}
      grouped={grouped}
      label={label}
      onCopy={onCopy}
      successMessage="Link copied"
      errorMessage="Couldn't copy link"
    />
  );
}
