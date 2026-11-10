import { CopyButton } from "@/components/feedback/copy-button";

export function CopyLink({
  href,
  label = "Copy link",
  grouped = false,
}: {
  href: string;
  label?: string;
  grouped?: boolean;
}) {
  return (
    <CopyButton
      size={grouped ? "icon" : "icon-xs"}
      grouped={grouped}
      label={label}
      onCopy={() => navigator.clipboard.writeText(new URL(href, window.location.origin).href)}
      successMessage="Link copied"
      errorMessage="Couldn't copy link"
    />
  );
}
