import { CopyButton } from "@/components/feedback/copy-button";

export function CopyLink({
  onCopy,
  label = "Copy link",
}: {
  onCopy: () => Promise<void>;
  label?: string;
}) {
  return (
    <CopyButton
      iconOnly
      size="icon-xs"
      label={label}
      onCopy={onCopy}
      successMessage="Link copied"
      errorMessage="Couldn't copy link"
    />
  );
}
